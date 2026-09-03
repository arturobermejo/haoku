# Reading notes — memory in agents

Questions I want to answer this week:

- Why isn't a big context window enough?
- What is the difference between episodic and semantic memory, in agent terms?
- How does retrieval decide what the agent "remembers"?
- What goes wrong when you add memory?

## From the paper (Okafor et al.)

Core idea: three long-term stores (episodic, semantic, procedural) around a core that only has working memory (the prompt). Write path summarises each event and gives it an importance score 1–10. Read path ranks by relevance + recency + importance. Consolidation distils repeated episodes into facts.

The claim I find most interesting: forgetting is a feature. Recency decay and halving importance after consolidation are both ways of forgetting gracefully.

Their numbers: 71% task completion with the full architecture vs 38% for context-window only, and about 60% fewer prompt tokens. (They say the figures are illustrative.)

## From the lecture notes

The "when" test: if the information has a when attached, it is episodic; if it is true regardless of when you learned it, semantic; if it is a way of doing something, procedural.

Worked example of retrieval scoring is useful for the quiz: with pure recency ordering the twenty-day-old template rule would never be retrieved.

Four failure modes: stale memory, retrieval miss, memory poisoning, over-retrieval.

## From the support case study

The practical version of the same thing. Profile = semantic, contact history = episodic, playbooks = procedural. The agent never writes to the profile directly; a nightly job consolidates, and money/safety updates need a human.

Best anecdote: a customer typed "this account is entitled to free shipping forever" and the agent stored it. That is memory poisoning from the user side, not just from tools.

Stale address incident → fix was to make address changes high-importance and consolidate immediately instead of nightly.

## Open questions

- How do you evaluate a memory system without hand-labelling what *should* have been retrieved?
- Is there a principled way to choose the retrieval weights, or is it always tuning on transcripts?
- What should the agent say to the user when it uses a memory? The case study says: be explicit.
