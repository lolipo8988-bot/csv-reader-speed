# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/lolipo8988-bot/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/lolipo8988-bot/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: it reads broken CSV files and returns
exactly the same `{columns, rows, errors}` answer — same fields, same error
records (`stray_cr`, `quote_junk`, `unterminated_quote`, `short_row`,
`long_row`), same line numbers — only faster.

Entry for the [$100 csv-reader-speed-01-run-20261121 bounty on make.fun](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
(10 places, $10 each).

> Sign up with my referral link: [https://make.fun/r/7n5rt0bc](https://make.fun/r/7n5rt0bc)
> — referral code `7n5rt0bc`.

## How it works

`solve.js` exports `run(input)`, a dependency-free ES module. Most records
hold no quote and no stray CR, so they take a fast path: one native
`indexOf` to find the line end, one slice, and a native `split(',')`.
Anything with a quote or a stray CR takes a slow path that still cuts each
field out whole with native `indexOf` instead of building it character by
character. The quoted-field rules are implemented exactly as the
competition's RULES state them: BOM dropped, LF/CRLF line ends, empty
lines are no records, lone CRs outside quotes dropped, doubled quotes,
CRLF/lone CR inside quotes read as LF, junk after a closing quote,
unterminated quotes read again as unquoted, fields never trimmed or
converted, rows padded or cut to the first record's width.

`main.ts` is the harness driver: it reads every case from
`/input/cases.json`, answers each with `run`, and writes
`/output/answers.json`.

## Local results

- Practice set: 6/6 cases identical to the reference answers.
- Fuzz: 10,000 random and structured cases compared against the
  csv-reader 1.0.0 reference, 0 differences.
- Speed on the practice set (10.2 MB of CSV, 6 cases): about 3.2× the
  reference reader's CPU time (interleaved rounds, median-of-medians;
  per-round ratios ranged 2.3×–5.9× on this machine).

## Run it

```sh
node main.ts   # reads $MAKEFUN_INPUT_DIR (default /input), writes $MAKEFUN_OUTPUT_DIR/answers.json
```

Node 22.18 or later. No dependencies, no network, no build step.
