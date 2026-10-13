# ClinPaper 产品备份

本目录保存 ClinPaper 的 5190 Demo 与产品知识文档，作为后续迭代和版本回退的 Git 基线。

## 目录

- `demo5190/`：ClinPaper 本地 Demo 站点代码与静态资源。
- `docs/`：ClinPaper 产品背景、功能说明、提示词规范与知识库使用说明。

## 启动 Demo

```bash
cd clinpaper/demo5190
npm install
npm start
```

默认访问地址：`http://localhost:5190`

## 本地模型配置

模型密钥只应保存在本地 `demo5190/.env` 中。该文件已被 `.gitignore` 排除，不会提交到 GitHub。可配置的环境变量及作用见 `demo5190/README.md`。

## 版本回退

每次完成一组可验证的修改后创建一次 Git 提交。需要撤回时，可在 GitHub 提交历史中查看差异并恢复到此前版本。
