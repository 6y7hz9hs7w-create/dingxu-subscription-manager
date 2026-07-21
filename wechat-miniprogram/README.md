# 订序微信小程序

这是“订序”的微信原生小程序版本，使用微信云开发完成无感登录和数据存储。

## 登录与数据安全

- 小程序启动后调用云函数，云函数通过 `cloud.getWXContext()` 获取当前用户的 `OPENID`。
- 客户端不传入、也不能修改数据所属用户；所有读写都在云函数中使用服务端获得的 `OPENID` 过滤。
- 不申请手机号、昵称或头像，不在小程序代码中保存 `AppSecret`。
- 微信小程序版和当前网页版是两个独立数据空间，暂不自动同步。

## 导入与运行

1. 项目已配置小程序 `AppID`：`wxa5a0b5d34c4f21fa`。
2. 安装并登录微信开发者工具，选择“导入项目”，目录选择本文件夹。
3. 在开发者工具中开通“云开发”，创建一个云环境。
4. 如未设置默认环境，把云环境 ID 填入 `miniprogram/config.js` 的 `cloudEnvId`。
5. 在云开发数据库中新建集合 `subscriptions`，安全规则设置为不允许客户端直接读写；业务数据只通过云函数访问。
6. 在开发者工具的“云函数”目录中，右键 `subscriptionService`，选择“上传并部署：云端安装依赖”。
7. 编译项目。首次打开时会自动完成微信身份识别，用户无需点击登录。

## 发布前检查

- 在真机预览中添加一项订阅，确认日历和消费分析能读取同一份数据。
- 使用另一个微信账号打开，确认看不到第一个账号的数据。
- 在小程序后台补充隐私保护指引；当前实现仅使用微信匿名身份标识和用户主动填写的订阅信息。
- 上传代码并提交微信审核。正式上传需要小程序管理员扫码，因此必须在已登录的微信开发者工具中完成。

## 项目结构

- `miniprogram/`：小程序页面、样式和客户端调用
- `cloudfunctions/subscriptionService/`：无感登录与订阅数据接口
- `project.config.json`：微信开发者工具项目配置

微信官方参考：

- [云开发初始化](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/init/client.init.html)
- [云函数获取微信上下文](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/reference-sdk-api/utils/Cloud.getWXContext.html)
