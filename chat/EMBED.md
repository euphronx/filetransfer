# 嵌入 filetransfer

这份目录是 [deepseek-web](https://github.com/euphronx/deepseek-web) 的 subtree。不要在 deepseek-web 仓库里改嵌入逻辑。

上游有更新时，在 filetransfer 根目录执行：

```sh
git subtree pull --prefix=chat --squash https://github.com/euphronx/deepseek-web.git main
```

没改过的文件会直接进来。冲突只会出现在下面这些文件：

- `package.json`
- `rspack.config.ts`
- `src/services/settings.ts`
- `src/services/api/client.ts`
- `src/services/chat/store.ts`
- `src/components/settings/settingsDialogState.ts`
- `src/components/settings/SettingsDialog.tsx`
- `src/components/chatInput/ChatInput.tsx`
- `src/components/chatInput/ChatInput.module.css`
- `src/components/chatInput/ChatInput.module.css.d.ts`
- `src/app/App.tsx`
- `src/i18n/zh.ts`
- `src/i18n/en.ts`

这些文件是嵌入时加的，上游没有，pull 时会保留：

- `EMBED.md`
- `scripts/build.mjs`
- `src/services/embed.ts`
- `src/services/serverQuota.ts`

合完后在 `chat/` 里执行 `pnpm install` 和 `pnpm build`，把 `dist/` 里的文件拷到 `public/deepseek/`，再和源码一起提交。`dist/` 不提交。
