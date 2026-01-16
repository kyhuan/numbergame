# 四位数对决

一个双人联网猜数字小游戏，支持房间对战、骰子先手、对局记录、资料管理与后台管理。

## 功能概览
- 账号系统：注册/登录，昵称/头像/签名管理。
- 对局流程：双方锁定秘密数字，分别掷骰子决定先手，轮流猜测。
- 结果判定：数字与顺序完全一致才算命中。
- 对局记录：保存胜负、猜测轨迹与时间戳。
- 观战模式：房间已满可观战。
- 后台管理：用户、对局、房间、公告、系统广播、操作日志。

## 本地运行
```bash
npm install
npm start
```
浏览器访问 `http://localhost:3000`。

## 环境变量
- `JWT_SECRET`：登录签名密钥（必填，强随机）。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：初始管理员账号（首次启动时创建）。

## 生产部署（Linux）
```bash
export JWT_SECRET="你的强随机密钥"
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD="admin"

pm2 start server.js --name numbergame
pm2 save
```

## 目录结构
- `server.js`：Express + WebSocket 服务端
- `public/`：前端页面与脚本
- `data/`：SQLite 数据库

## 后台地址
访问 `/admin.html` 进入后台。
