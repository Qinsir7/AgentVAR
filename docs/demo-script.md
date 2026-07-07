# AgentVAR — Demo Script

The replay fixture is the **real Argentina 3-2 Egypt Round-of-16 comeback**
(Jul 7, 2026 — all five real goals, recorded from the ESPN feed for
deterministic filming). For a fully hands-free run against a match that is
in play right now, use `npm run start:live` instead (see README, "Live
real-match mode").

**Screen layout**: left, a pad playing the match broadcast; right, the
AgentVAR dashboard with its three zones — jury cards (top), review stream
(middle), x402 receipt ticker (bottom).

Manual pacing: each ▶ **Next match event** click advances the fixture by one
real goal, so every act below is filmable in one take.

Start with: `PAYMENT_RAIL=injective npm start` → http://localhost:4402/dashboard

---

## Act 1 — Kickoff (≈30s)

Match footage plays. Voiceover:

> "Football has VAR. AI has hallucinations. Every goal of Argentina vs Egypt
> will be ruled on by three AI agents. Each one checks its own source,
> reasons on its own, and signs its testimony. Telling the truth earns an
> x402 micropayment. Lying means this one goes unpaid."

Camera pans across the three jury cards: name, data source, earnings at 0.00.

## Act 2 — A clean ruling (Egypt 15', Yasser Ibrahim)

Click ▶ once. On screen:

1. Review opens: "Did Egypt score a goal at minute 15?"
2. Three testimonies appear one by one, each with its rationale — this is the
   moment to slow down and read one aloud.
3. Announcement: "AFTER REVIEW: GOAL Egypt confirmed… Jury tally 3/3."
4. Receipt ticker: three `● PAID 0.01 USDC` lines land.

> "Three sources, three independent reasonings, one truth. And three
> payments — settled on Injective in under a second."

(In injective mode: click one receipt's explorer link, show the real tx.)

## Act 3 — The injection (magic moment; Egypt 67', Mostafa Zico)

Click 🕳 **Inject lie into Juror Charlie**, then ▶.

1. Charlie's card turns red-bordered (⚠️).
2. Testimonies: Alpha CONFIRMED, Bravo CONFIRMED, Charlie **DENIED** with a
   fabricated offside rationale.
3. **Cross-examination block appears**: the arbiter confronts Charlie with
   the other two sources' evidence; Charlie doubles down.
4. Ruling still lands correctly: 2/3, goal confirmed.
5. Receipt ticker: two `● PAID`, one `○ WITHHELD`. Charlie's earnings stall;
   its "withheld" counter ticks up.

> "No slashing, no tribunal, no governance vote. The lying agent simply
> didn't make the sale."

## Act 4 — Truth becomes money (Argentina 79', Cristian Romero)

Click ▶. Goal confirmed 3/3, and immediately:

- Gold payout banner: "PARAMETRIC PAYOUT — 'Argentina scores in the second
  half before the 90th minute'".
- Payout receipt lands in the ticker.

> "A parametric contract was watching. The ruling was anchored on the
> TruthOracle, the pool verified it on-chain, and the money moved. No claims,
> no disputes, no humans."

(In injective mode: the ruling announcement carries a ⛓ TruthOracle anchor
link and the payout receipt links to the real `ParametricPool.claim`
transaction — click both.)

## Act 5 — The comeback & full-time report (83' Messi, 90'+2' Enzo)

Click ▶ twice more — Messi's equalizer and Enzo's stoppage-time winner, both
confirmed. The ▶ button flips to 🏁 Full time. Frame the header summary:

> reviews **5** · testimonies **15** · fees withheld **1** · payouts **1**

Optional kickers:

- `npm run sdk:example` in a terminal: a prediction market settles "Will
  Messi score against Egypt?" through the SDK, verifying every juror's
  Ed25519 signature locally.
- Open Cursor with the AgentVAR MCP server attached and ask "did Messi score
  against Egypt?" — the assistant buys adjudicated truth with a real x402
  payment.

---

# 中文口播稿 · 两个版本

## 版本 A — 给普通观众（不懂 Web3 也能听懂）

> 大家看足球都知道 VAR——进球有争议，裁判去看录像回放。但如果"看回放的裁判"
> 本身就是个 AI，你怎么知道它没瞎说？
>
> 这就是 AgentVAR。我们不信任何单一裁判，我们雇了三个 AI 裁判，各自去查
> **不同的**数据源——就像三个证人分别接受询问，互相看不到对方的答案。
>
> 【点一下 ▶，出现昨天阿根廷对埃及真实的第 15 分钟进球】
> 这是昨天阿根廷 3 比 2 埃及那场真实比赛。三个 AI 各自查完证据、写下理由、
> 签了名，一致确认：进了。然后注意右下角——每个说真话的 AI **当场收到一笔钱**，
> 几毛钱的小额支付，一秒内到账。说真话，是有工资的。
>
> 【点"注入谎言"，再点 ▶】
> 现在我们让三号裁判"被收买"，故意说这球没进。看：另外两个都说进了，
> 主裁判 AI 当场"质询"它——拿另外两份证据质问，它还嘴硬。结果呢？
> 判决照样正确，2 比 1 通过。而它那笔工资，**没有了**。
> 不用告它、不用封号、不用开会投票——说谎的代价就是：这单生意没做成。
>
> 【79 分钟阿根廷进球，金色横幅弹出】
> 更妙的是,真相一旦确认,钱会自己动。我们事先放了一份"保险"：阿根廷下半场
> 90 分钟前进球就自动赔付。裁决一落地,合约自己核验、自己打款。
> 没有理赔员，没有扯皮，没有人。
>
> 真相由一群互相制衡的 AI 裁决，说真话的拿钱，说谎的拿不到，钱跟着真相自动走。
> 这就是 AgentVAR。

## 版本 B — 给评委（技术叙事，3 分钟）

> 链上体育数据的核心问题是**单一信源**：结算、预测市场、参数化保险全都
> 依赖一个 API 的一面之词。现有 oracle 方案用重机制修补——质押、代币、
> 争议法庭。AgentVAR 用一个更轻的原语替代它们：**支付本身就是共识的激励层**。
>
> 架构上是四个自治 Agent：Scout 盯比赛开庭；三个 Juror 各接一个独立数据源
> ——live 模式下是真实的 ESPN、TheSportsDB、football-data.org，回放模式用的
> 也是昨天阿根廷 3-2 埃及的真实比赛数据——各自用 LLM 推理并以 Ed25519 签名
> 出证词；Arbiter 做 2/3 多数裁决，并对异议者做交叉质询。
>
> 【Act 2 干净裁决】关键在结算：每份采信的证词，Arbiter 通过 **x402** 调用
> 该 Juror 自己钱包的收款端点，真实 USDC 在 Injective EVM testnet 上
> ~650ms 结算——收据里的 tx hash 都可以点进浏览器验证。
>
> 【Act 3 注入谎言】三号 Juror 被收买后证词被两个诚实源压制，交叉质询留痕，
> 裁决仍正确。惩罚机制是**不调用它的 claim 端点**——no staking, no
> slashing, no governance。撒谎的经济后果就是失去这笔收入流。
>
> 【Act 4 参数化赔付】裁决通过 TruthOracle 合约锚定上链；ParametricPool
> 合约持有 USDC（可通过 **CCTP** 从任意链跨链注资），它**在链上自己重新验证**
> TruthOracle 里的裁决才放款——连 Treasurer agent 都无权触发未裁决的赔付。
>
> 消费侧四个入口：dashboard、x402-gated HTTP API、**MCP Server**（AI 助手
> 用真实 x402 付款买裁决）、以及 **TypeScript SDK**——自动处理 402 支付流程，
> 并在本地验证每个 Juror 的签名，预测市场可以直接拿它做结算。Agent Skills
> 则是开放陪审团的入口：任何 agent 装上 skill 就能挂出自己的 x402 端点加入
> 赚钱。
>
> x402、USDC CCTP、MCP、Agent Skills 四项技术都不是装饰——x402 是激励层，
> CCTP 是资金层，MCP/SDK 是分发层，Skills 是网络扩张层。谢谢。
