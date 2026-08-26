--[[
    UIZed 生成的项目主文件
]]
-- 导入 ISUI 目录下的 Lua 代码文件
require "ISUI.GlobalFunctions"
require "ISUI.ISSimpleEmpty"
require "ISUI.ISSimpleText"
require "ISUI.ISSimpleRichText"
require "ISUI.ISSimpleProgressBar"
require "ISUI.ISSimpleButton"
require "ISUI.ISSimpleImageButton"
require "ISUI.ISSimpleTickBox"
require "ISUI.ISSimpleEntry"
require "ISUI.ISSimpleComboBox"
require "ISUI.ISSimpleScrollingListBox"
require "ISUI.ISSimpleImage"

local UI

local function sayHello()
    getPlayer():Say("Hello")
end

local function sayWorld()
    getPlayer():Say("World")
end

local function onCreateUI()
    UI = NewUI()
    UI:setTitle("UIZed")
    UI:setWidthPercent(0.4000)
    UI:addText("text1", "Hello world", "Title", "Center")
    UI:nextLine()
    UI:addButton("button1", "btn1", sayHello)
    UI:addEmpty("empty1")
    UI:addButton("button2", "btn2", sayWorld)
    UI:nextLine()
    UI:addProgressBar("pbar1", 20, 0, 100)
    UI["pbar1"]:setColor(0.500, 1.000, 0.251, 0.251)
    UI:nextLine()
    UI:addImage("image1", "media/textures/twd.png")
    UI:saveLayout()
end

Events.OnCreateUI.Add(onCreateUI)