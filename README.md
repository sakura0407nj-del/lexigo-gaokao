# 拾词 LexiGo · 高考英语学习室

面向高中生的英语学习网站，手机和电脑浏览器均可使用，无需登录 ChatGPT。React + Vite 提供前端，Netlify Functions 运行公共 API，私有 Netlify Blobs 暂存异步 AI 任务。GitHub 保存源代码；当前由维护者检查并构建后，通过 Netlify CLI 更新固定的 beta 草稿网址，尚未配置 GitHub 推送自动部署。

在线学习：[拾词 LexiGo · beta](https://beta--lexigo-gaokao-66876.netlify.app)。

## 学习内容

- **词汇**：3,677 个 ECDICT `gk` 标签词条，支持中英文搜索、通用语料高/中/低频分类、收藏和已掌握记录。支持教材册次、单元、11 类词性、19 类主题、来源及排序维度；一词可以属于多个主题。无法确认语料排名的词明确显示“未标频”，不会归入低频。合并教材后共有 5,084 个去重词。
- **卡片与复习**：从当前筛选范围抽取 20/30/50 张卡片，翻面回想、发音、标记熟悉程度；按 1/3/7/14/30 天安排复习，并提供每日 10/20/40 词目标。
- **教材听写**：人教版高中英语 2019 版必修一至三、选择性必修一至四，共 7 册、36 单元、2,731 个教材词/短语/专名条目。支持单元组合、顺序/随机、数量选择、英美音偏好、语速、重复播放、中文提示、错词重听及报告导出。发音使用浏览器/系统英语语音，音色及离线可用性取决于设备。
- **练习**：84 个经筛选的 2016–2022 年真题单元、16 个原创模拟单元，共 668 道小题，涵盖阅读理解、语法填空、七选五和完形填空。题库支持年份、题型、来源、难度、完成状态与搜索筛选；作答草稿和计时保存在本机。不是所有年份、地区和卷种的完整题库。
- **AI 命题与批改**：按题型和难度生成原创练习，可结合错题薄弱点出题；提供作文分项反馈、错误原因与订正版；评改文字或图片题目。支持 JPG、PNG、WebP，最多 3 张，每张不超过 3 MB。
- **定制模拟卷**：组合阅读理解、语法填空、七选五和完形填空，自选篇数、难度、主题及 5–180 分钟练习时间。可快速使用题库组卷，也可逐段生成 AI 原创卷；支持错题知识点定向训练、作答保存、整卷提交、逐题解析及考后七日练习计划。本功能是客观题专项模拟，不包含听力和作文，不宣称等同完整高考卷。
- **英语闯关**：英语选门与小人队伍跑酷结合，提供中文选词、句子填空、短语辨析，支持思考和计时模式。词汇可按教材范围或本机收藏筛选；句子与短语是通用高中专项，不能据此认定对应教材单元。答错自动进入错题集，游戏本身不调用 AI、不消耗 AI 任务额度。
- **错题集**：练习与批改中的错误可自动加入，支持复习和错题挑战，通过后移入已掌握档案。精确答案或选择题挑战直接判定，需要语言判断的挑战使用 AI。
- **知识与记录**：独立知识卡入口、12 张高中英语知识卡；学习记录、收藏、听写及错题的 JSON 备份导入/导出。

词频来自一般英语语料，并非高考出现次数。教材词目由社区资料整理，释义不是教材原文复刻；印次差异以纸质教材为准。AI 练习标记为原创，批改是学习反馈，不是官方考试评分。

## 本地运行

需要 Node.js 22.13 或以上版本及 npm。Windows PowerShell：

```powershell
npm ci
Copy-Item .env.example .dev.vars
```

编辑 `.dev.vars`，填写自己的模型密钥和至少 32 字符的随机 `PAPER_SECRET`。可在本机生成随机值后写入私有配置；不要将生成的值上传到公共仓库。

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run dev
```

本地入口为 `http://127.0.0.1:5178`。Netlify Vite 插件提供 Functions/Blobs 开发适配；若开发工具要求关联项目，使用自己的 Netlify 项目完成正常登录/关联。没有模型密钥时，词库、听写和内置练习仍可用，AI 请求会提示未配置。

```sh
npm run typecheck
npm test
node scripts/check-vocabulary.mjs
npm run build
```

构建产物位于 `dist-public/`。普通测试使用本地数据或模拟模型响应，不主动调用真实模型。不要提交构建产物、依赖、私有配置和运行日志。

## GitHub 与 Netlify 部署

源码仓库：[sakura0407nj-del/lexigo-gaokao](https://github.com/sakura0407nj-del/lexigo-gaokao)。英语网站使用独立的 Netlify 项目 `lexigo-gaokao-66876`，不修改其他网站。

当前使用 **Netlify draft deploy 的固定 beta 别名**，不是 Git 分支自动部署。以后更新源码、通过检查、重新运行部署脚本，就会更新同一别名网址。GitHub 提交本身不会自动发布网站。

### 本地维护者更新

```sh
npx netlify login
npx netlify link --id 916eafc6-a5f4-4f2d-9517-c1d9c85e4247
npm run typecheck
npm test
npm run build
node scripts/deploy-netlify.mjs --check
node scripts/deploy-netlify.mjs
```

脚本读取本机被 Git 忽略的 `.dev.vars`，验证项目关联、检查静态构建是否含有密钥，然后只为本英语项目发布 `beta` 草稿别名。它使用已有的 Netlify CLI 登录，不创建新凭据、不切换套餐。发布目录是 `dist-public`，Functions 目录是 `netlify/functions`；脚本不会打印密钥或含密钥的命令。

**Free 方案的环境配置**：此账户不支持付费方案的细分站点环境变量作用域。脚本使用 CLI 正式提供的 `--secret-env`，把 `AI_API_KEY` 和 `PAPER_SECRET` 作为本次部署的 Functions 专用私密变量传递，模型名称使用部署变量。私密值不写入源码、`netlify.toml` 或 `VITE_*` 变量，不依靠公开网页保存。因为变量属于单次部署，每次更新都应通过该脚本重新提供，直接上传静态目录不能恢复 AI 服务。

| `.dev.vars` 配置项 | 用途 |
| --- | --- |
| `AI_API_KEY` | 服务器访问模型服务的密钥 |
| `AI_MODEL` | 首选模型 ID，示例为 `[ASP]gemini-4-argon` |
| `AI_FALLBACK_MODEL` | 首选通道不可用时的备用模型 ID，可选 |
| `PAPER_SECRET` | 至少 32 字符的随机私钥，用于会话、调度签名及试卷加密；保持稳定，轮换会使旧会话/试卷失效 |

模型传输位于 `lib/learning-server.ts`。更换供应商时需调整服务地址与模型 ID；密钥仍由服务器环境提供。部署详情只记录脱敏后的网址和状态，保存在被忽略的 `work/deployment/`。

项目可见性设置为 Public，访客无需 ChatGPT 或 Netlify 账户。`/api/status` 仅说明必需配置是否存在；“已配置”不等于实时探测了供应商。每次发布后，应实际检查 AI 任务提交、轮询、命题与批改。

草稿别名部署不等于生产部署，托管运行、请求和流量仍占免费额度；额度用尽或平台暂停时，可用性以 Netlify 状态为准。脚本不升级付费方案。未来如需 GitHub 自动发布，需要另外连接该仓库并配置其环境与部署流程，不能把当前手动别名更新称为自动部署。

参考：[Netlify CLI 部署](https://docs.netlify.com/api-and-cli-guides/cli-guides/get-started-with-cli/)、[托管额度](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/)、[后台函数](https://docs.netlify.com/build/functions/background-functions/)。GitHub Pages 只能托管静态页面，不能单独运行本站需要的私密 AI 后端。

## 隐私与任务机制

收藏、掌握状态、练习历史和错题保存在**当前浏览器的 localStorage**，不会自动跨设备同步。清理站点数据会清除本机记录；可导出 JSON 后在另一设备导入。备份可能包含自己的作文或答题内容，应自行保管。

服务器使用签名的 HttpOnly、SameSite Cookie 区分匿名访客，有效期 30 天；线上 Cookie 仅通过 HTTPS 传输。服务端不信任浏览器提交的用户 ID。

AI 提交的文字和图片会发送给配置的模型服务。任务输入、图片和结果在网站私有存储中设置 **24 小时有效期**；过期结果不能通过 API 查询，后台每小时清理过期对象。正常完成或失败的后台任务提前删除上传图片。托管暂停或清理异常时，物理删除可能延后；模型服务商自身的数据保存规则不由本站控制。浏览器的错题和历史保留必要文字，不保存上传图片文件。

图片逐张上传，任务只传引用，避免超过后台请求大小限制。提交返回任务 ID，页面轮询进度；原子声明防止重复调用。约 3 分钟未完成会显示失败，不自动另建任务。网络中断重试复用提交编号；重新点击提交则创建新任务。

每日额度按北京时间日期计算：每位访客 30 个 AI 任务、每个 IP 30 个、全站共享 200 个。额度在任务开始前预留，失败不退回；格式重试或备用通道属于同一任务，所以任务数量不等于供应商请求数量。精确答案挑战不占 AI 额度。图片上传另设数量上限；IP 仅以 HMAC 摘要用于额度记录，额度槽位定时回收。

AI 试卷答案通过 AES-GCM 加密封装，绑定当前访客，7 天有效；提交前前端不获得明文答案。更换浏览器、清 Cookie 或轮换私钥后，旧 AI 试卷可能无法继续评分。

整卷 AI 命题按篇提交，每篇占一次任务额度，完成的篇目会保留。提交前保存请求编号与原始命题设置，获得任务编号后保存查询进度；中断恢复会复用已有请求或继续轮询。组卷与评卷接口严格限制篇数、题号和请求大小，题库答案从服务器读取，AI 答案从当前访客的密文中解析。整卷成绩、错题和完成标记在同一次本机记录更新中保存，避免刷新造成重复收录。

考后提升方向由本卷的实际分数、作答错误、漏题数和题目知识点产生。报告不调用 AI 猜测能力，不把未作答直接判为知识薄弱，也不预测高考成绩。用时是浏览器记录的练习时间，并非考试监考数据。

## 数据署名

- [ECDICT](https://github.com/skywind3000/ECDICT)：MIT 许可；筛选 `gk` 标签，整理释义和词频分类。许可见 `public/licenses/ECDICT.txt`。
- [GAOKAO-Bench](https://github.com/OpenLMLab/GAOKAO-Bench)：Apache-2.0；规范空格、题号、选项，剔除缺失或答案/解析冲突记录，保留年份和卷别。许可见 `public/licenses/GAOKAO-Bench.txt`。
- 教材词目参考 [cyforkk/pep-english-words](https://github.com/cyforkk/pep-english-words) 和 [lilinji/English](https://github.com/lilinji/English)，修正单元边界并合并词典释义。本站不是出版社官方产品，不复制教材课文或插图。
- 原创教学内容经 AI 辅助编写和项目复核；虚构人物及故事用于练习，不应当作真实新闻或研究。

完整来源和修改说明见 `public/licenses/NOTICE.txt`、`data/sources.json`。`scripts/import-*.py` 保留转换方法；部分导入脚本需先准备上游缓存，运行应用本身不需重新下载原始数据。原始缓存和模型日志不提交到仓库。
