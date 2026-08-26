"""
UIZed 发布打包脚本

流程：
  1. 构建前端（npm run build），产物在项目根目录 dist/
  2. 用 .venv 里的 pyinstaller 单文件打包后端 app.py 为 exe
  3. 用 Python 代码把依赖（前端 dist、数据 src、ISUI 目录）复制到发布目录

用法（在 backend 目录下）：
  python build.py
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# 前端项目根目录（package.json 所在）
FRONTEND_DIR = PROJECT_ROOT
# 前端构建产物
FRONTEND_DIST = PROJECT_ROOT / "dist"
# 后端资源目录（全局函数/全局事件.json、ISUI 等，整体复制到发布包 src/）
DATA_SRC = BACKEND_DIR / "src"

# PyInstaller 可执行文件
PYINSTALLER = BACKEND_DIR / ".venv" / "Scripts" / "pyinstaller.exe"
# PyInstaller 中间产物目录（避免与前端 dist/ 混淆）
PYI_DIST = BACKEND_DIR / "pyi_dist"
PYI_WORK = BACKEND_DIR / "pyi_build"
# 打包后的可执行文件名（PyInstaller 内部名称）
EXE_NAME = "UIZed"


def load_version() -> str:
    """从 src/config.json 读取版本号，用于命名发布目录与 exe"""
    config_file = DATA_SRC / "config.json"
    if config_file.exists():
        try:
            data = json.loads(config_file.read_text(encoding="utf-8"))
            return str(data.get("version", "v0.0.0"))
        except Exception:
            pass
    return "v0.0.0"


def publish_dir() -> Path:
    """最终发布目录，命名为 UIZed {版本号}"""
    return BACKEND_DIR / f"UIZed {load_version()}"


def step(msg: str) -> None:
    print("\n" + "=" * 60)
    print(f"[STEP] {msg}")
    print("=" * 60)


def check(path: Path, desc: str) -> None:
    if not path.exists():
        print(f"[错误] 缺少 {desc}: {path}")
        sys.exit(1)


def build_frontend() -> None:
    """构建前端 -> 项目根目录 dist/"""
    step("构建前端 (npm run build)")
    npm = "npm.cmd"
    subprocess.run([npm, "run", "build"], cwd=str(FRONTEND_DIR), check=True)


def run_pyinstaller() -> None:
    """用 .venv 里的 pyinstaller 单文件打包 app.py"""
    step("PyInstaller 打包 app.py 为单文件 exe")
    # 清掉历史产物，避免残留
    shutil.rmtree(PYI_DIST, ignore_errors=True)
    shutil.rmtree(PYI_WORK, ignore_errors=True)
    subprocess.run(
        [
            str(PYINSTALLER),
            "--onefile",
            "--noconfirm",
            "--clean",
            "--name",
            EXE_NAME,
            "--distpath",
            str(PYI_DIST),
            "--workpath",
            str(PYI_WORK),
            "app.py",
        ],
        cwd=str(BACKEND_DIR),
        check=True,
    )


def assemble() -> None:
    """把 exe 和依赖复制到发布目录"""
    step("组装发布目录")
    target = publish_dir()
    # 清理并重建发布目录
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)

    exe_file = PYI_DIST / f"{EXE_NAME}.exe"
    check(exe_file, "打包产物 exe")
    shutil.copy2(exe_file, target / f"{EXE_NAME}.exe")
    print(f"  复制 {EXE_NAME}.exe")

    # 前端构建产物 dist/
    check(FRONTEND_DIST, "前端构建产物 dist")
    shutil.copytree(FRONTEND_DIST, target / "dist")
    print("  复制 dist/")

    # 资源的整体目录 src/（含数据 json、ISUI 等）
    check(DATA_SRC, "后端资源目录 src")
    shutil.copytree(DATA_SRC, target / "src")
    print("  复制 src/")


def cleanup() -> None:
    """打包完成后清除中间产物和无用文件"""
    step("清理无用目录和文件")
    targets = [
        ("前端构建产物", FRONTEND_DIST),
        ("PyInstaller spec 文件", BACKEND_DIR / f"{EXE_NAME}.spec"),
        ("PyInstaller 中间目录", PYI_DIST),
        ("PyInstaller 工作目录", PYI_WORK),
    ]
    for desc, p in targets:
        if p.exists():
            if p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()
            print(f"  已清除 {desc}: {p}")


def move_to_root() -> Path:
    """把发布包从 backend 移动到项目根目录"""
    step("移动发布包到项目根目录")
    src = publish_dir()
    dest = PROJECT_ROOT / src.name
    if dest.exists():
        shutil.rmtree(dest)
    if src.exists():
        shutil.move(str(src), str(dest))
    return dest


if __name__ == "__main__":
    check(PYINSTALLER, "pyinstaller (请确保 .venv 已安装 pyinstaller)")

    build_frontend()
    run_pyinstaller()
    assemble()
    cleanup()
    final = move_to_root()

    print("\n" + "=" * 60)
    print(f"打包完成！发布目录: {final}")
    print(f"运行 {EXE_NAME}.exe 即可。")
    print("访问 http://127.0.0.1:8765")
    print("=" * 60)