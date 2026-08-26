"""
后端服务入口
"""
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI(
    title="UIZed 后端服务",
    description="Project Zomboid 模组 UI 编辑器后端服务",
    version="0.1.0",
)

# 本地前后端项目，允许所有来源跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 后端根目录
#  打包成 exe 后：以可执行文件所在目录为基准（依赖文件在同级 src/dist/ISUI 下）
#  源码运行：以 app.py 所在目录为基准
def _base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


BASE_DIR = _base_dir()
# 资源目录（数据 json、ISUI 等，打包后随 src 一起分发）
SRC_DIR = BASE_DIR / "src"
# 运行配置
CONFIG_FILE = SRC_DIR / "config.json"


def _load_config() -> dict:
    """从 src/config.json 读取运行配置（host/port/version 等）"""
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


CONFIG = _load_config()
# 输出目录
OUTPUT_DIR = BASE_DIR / "output"
# 项目内主 Lua 文件的相对路径（media/lua/client/{name}.lua）
MEDIA_LUA_CLIENT = Path("media") / "lua" / "client"
# 全局函数数据文件（src/全局函数.json）
GLOBAL_FUNCTIONS_FILE = SRC_DIR / "全局函数.json"
# 全局事件数据文件（src/全局事件.json）
GLOBAL_EVENTS_FILE = SRC_DIR / "全局事件.json"


def _main_lua_path(proj_dir: Path, name: str) -> Path:
    """项目主 Lua 文件的完整路径"""
    return proj_dir / MEDIA_LUA_CLIENT / f"{name}.lua"
# 新建项目时要复制一份的 ISUI 源目录（位于 src/ 下，打包后随 src 一起分发）
ISUI_SOURCE_DIR = SRC_DIR / "ISUI"


def _build_main_lua(project_name):
    """生成项目主 Lua 文件的基础代码"""
    return f"""--[[
    UIZed 生成的项目主文件
]]
-- 导入 ISUI 目录下的 Lua 代码文件
require "ISUI.GlobalFunctions"
require "ISUI.ISSimpleUI"
require "ISUI.ISSimpleText"
require "ISUI.ISSimpleRichText"
require "ISUI.ISSimpleProgressBar"
require "ISUI.ISSimpleButton"
require "ISUI.ISSimpleTickBox"
require "ISUI.ISSimpleEntry"
require "ISUI.ISSimpleComboBox"
require "ISUI.ISSimpleScrollingListBox"
require "ISUI.ISSimpleImage"
require "ISUI.ISSimpleImageButton"
require "ISUI.ISSimpleEmpty"

local UI

-- 在游戏创建 UI 时，使用 NewUI 创建一个窗口
local function onCreateUI()
    UI = NewUI()
    UI:setTitle("{project_name}")

    UI:addText("text1", "Hello world", "Small", "Center")

    UI:saveLayout()
end

Events.OnCreateUI.Add(onCreateUI)
"""


@app.post("/api/project/new")
def create_new_project():
    """依据 docs/新建项目目录结构.md 创建新项目目录结构"""
    # 确保 output 目录存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 项目目录名：日期_时间，如 20260825_102106
    project_name = datetime.now().strftime("%Y%m%d_%H%M%S")
    proj_dir = OUTPUT_DIR / project_name
    proj_dir.mkdir(parents=True, exist_ok=True)

    # media/lua/client
    client_dir = proj_dir / MEDIA_LUA_CLIENT
    client_dir.mkdir(parents=True, exist_ok=True)

    # media/lua/shared/Translate/CN 与 EN
    shared_translate_dir = proj_dir / "media" / "lua" / "shared" / "Translate"
    (shared_translate_dir / "CN").mkdir(parents=True, exist_ok=True)
    (shared_translate_dir / "EN").mkdir(parents=True, exist_ok=True)

    # media/textures 目录
    (proj_dir / "media" / "textures").mkdir(parents=True, exist_ok=True)

    # 复制 docs 下的 ISUI 目录一份到 media/lua/client
    if ISUI_SOURCE_DIR.exists():
        shutil.copytree(ISUI_SOURCE_DIR, client_dir / "ISUI", dirs_exist_ok=True)

    # 项目主 Lua 文件（名称同项目目录名），写入基础代码
    main_lua_file = _main_lua_path(proj_dir, project_name)
    main_lua_file.write_text(_build_main_lua(project_name), encoding="utf-8")

    # 中英文翻译文件
    for lang in ("CN", "EN"):
        (shared_translate_dir / lang / "IG_UI.json").write_text(
            "{}",
            encoding="utf-8",
        )

    return {
        "success": True,
        "name": project_name,
        "path": str(proj_dir),
    }


@app.get("/api/project/list")
def list_projects():
    """列出 output 目录下的所有项目"""
    if not OUTPUT_DIR.exists():
        return {"success": True, "projects": []}

    projects = []
    for folder in sorted(OUTPUT_DIR.iterdir(), reverse=True):
        if not folder.is_dir():
            continue
        main_lua_file = _main_lua_path(folder, folder.name)
        main_lua = ""
        if main_lua_file.exists():
            main_lua = main_lua_file.read_text(encoding="utf-8")
        projects.append(
            {
                "name": folder.name,
                "path": str(folder),
                "mainLua": main_lua,
            }
        )
    return {"success": True, "projects": projects}


@app.get("/api/global-functions")
def list_global_functions():
    """读取全局函数数据文件返回给前端"""
    try:
        data = json.loads(GLOBAL_FUNCTIONS_FILE.read_text(encoding="utf-8"))
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "message": f"读取全局函数数据失败: {e}"}


@app.get("/api/global-events")
def list_global_events():
    """读取全局事件数据文件返回给前端"""
    try:
        data = json.loads(GLOBAL_EVENTS_FILE.read_text(encoding="utf-8"))
        return {"success": True, "data": data}
    except Exception as e:
        return {"success": False, "message": f"读取全局事件数据失败: {e}"}


@app.get("/api/project/{name}")
def get_project_content(name: str):
    """读取项目的主 Lua 文件内容"""
    proj_dir = OUTPUT_DIR / name
    main_lua_file = _main_lua_path(proj_dir, name)
    if not main_lua_file.exists():
        return {"success": False, "error": "文件不存在"}
    return {
        "success": True,
        "name": name,
        "content": main_lua_file.read_text(encoding="utf-8"),
    }


def _build_tree(path: Path, rel: str):
    """递归构建目录树：目录在前，文件在后，各自按名称排序"""
    entries = []
    for child in sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
        child_rel = f"{rel}/{child.name}" if rel else child.name
        if child.is_dir():
            entries.append(
                {
                    "name": child.name,
                    "type": "dir",
                    "path": child_rel,
                    "children": _build_tree(child, child_rel),
                }
            )
        else:
            entries.append({"name": child.name, "type": "file", "path": child_rel})
    return entries


@app.get("/api/project/{name}/tree")
def get_project_tree(name: str):
    """返回项目 media 目录的完整目录树"""
    proj_dir = OUTPUT_DIR / name
    if not proj_dir.is_dir():
        raise HTTPException(status_code=404, detail="项目不存在")
    media_dir = proj_dir / "media"
    tree = {
        "name": "media",
        "type": "dir",
        "path": "media",
        "children": _build_tree(media_dir, "media") if media_dir.exists() else [],
    }
    return {"success": True, "tree": tree}


class LuaSaveBody(BaseModel):
    """保存项目主 Lua 文件请求体"""

    content: str


@app.post("/api/project/{name}/lua")
def save_project_lua(name: str, body: LuaSaveBody):
    """保存项目的主 Lua 文件内容到磁盘"""
    proj_dir = OUTPUT_DIR / name
    if not proj_dir.is_dir():
        return {"success": False, "error": "项目不存在"}

    main_lua_file = _main_lua_path(proj_dir, name)
    main_lua_file.parent.mkdir(parents=True, exist_ok=True)
    main_lua_file.write_text(body.content, encoding="utf-8")
    return {"success": True, "name": name}


def _get_textures_dir(name: str) -> Path:
    """返回项目的 media/textures 目录（不存在则创建），项目不存在抛 404"""
    proj_dir = OUTPUT_DIR / name
    if not proj_dir.is_dir():
        raise HTTPException(status_code=404, detail="项目不存在")
    textures_dir = proj_dir / "media" / "textures"
    textures_dir.mkdir(parents=True, exist_ok=True)
    return textures_dir


# 支持作为纹理展示的图片扩展名
_TEXTURE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp")


@app.post("/api/project/{name}/open")
def open_project_folder(name: str):
    """在系统文件管理器中打开项目所在目录"""
    proj_dir = OUTPUT_DIR / name
    if not proj_dir.is_dir():
        raise HTTPException(status_code=404, detail="项目不存在")
    if os.name == "nt":
        os.startfile(proj_dir)  # type: ignore[attr-defined]
    else:
        import subprocess
        import sys

        opener = "open" if sys.platform == "darwin" else "xdg-open"
        subprocess.Popen([opener, str(proj_dir)])
    return {"success": True, "name": name}


@app.get("/api/project/{name}/textures")
def list_textures(name: str):
    """列出项目 textures 目录下的所有图片文件名"""
    textures_dir = _get_textures_dir(name)
    files = sorted(
        f.name
        for f in textures_dir.iterdir()
        if f.is_file() and f.suffix.lower() in _TEXTURE_EXTS
    )
    return {"success": True, "files": files}


@app.post("/api/project/{name}/textures")
async def upload_texture(name: str, file: UploadFile = File(...)):
    """上传 PNG 图片到项目 textures 目录，仅允许 png"""
    textures_dir = _get_textures_dir(name)
    filename = Path(file.filename or "").name or "image.png"
    if Path(filename).suffix.lower() != ".png":
        raise HTTPException(status_code=400, detail="仅支持 PNG 图片")
    dest = textures_dir / filename
    dest.write_bytes(await file.read())
    return {"success": True, "filename": filename}


@app.get("/api/project/{name}/textures/{filename}")
def get_texture(name: str, filename: str):
    """返回项目 textures 目录下的图片文件（用于前端预览）"""
    textures_dir = _get_textures_dir(name)
    safe = Path(filename).name  # 防止路径穿越
    file = textures_dir / safe
    if not file.is_file():
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(file)


# 打包后托管前端构建产物 dist/（打开 http://127.0.0.1:8765 即可访问界面）
_DIST_DIR = BASE_DIR / "dist"
if _DIST_DIR.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount(
        "/",
        StaticFiles(directory=str(_DIST_DIR), html=True),
        name="ui-static",
    )


if __name__ == "__main__":
    import uvicorn

    host = os.getenv("UIZED_HOST", str(CONFIG.get("host", "127.0.0.1")))
    port = int(os.getenv("UIZED_PORT", str(CONFIG.get("port", 8765))))
    reload = os.getenv("UIZED_RELOAD", "0") == "1"

    if getattr(sys, "frozen", False):
        # 打包后不支持 reload，直接以 app 对象启动
        uvicorn.run(app, host=host, port=port)
    else:
        uvicorn.run(
            "app:app",
            host=host,
            port=port,
            reload=reload,
        )