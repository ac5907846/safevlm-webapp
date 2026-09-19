# Web app: Qualifying Vision-Language Models as Construction Safety Inspectors

Companion tool to the article *Qualifying Vision-Language Models as Construction Safety Inspectors:
Confidence Calibration, Selective Prediction, and Conformal Risk Control* (under review).

Live at **https://safevlm.electriai.com** (GitHub Pages behind a Cloudflare DNS record) and mirrored
as a Hugging Face Space at **https://huggingface.co/spaces/ac5907846/safevlm**.

A static site: HTML, CSS, JS, JSON and WebP. No build step, no backend, no third-party host, no web
font, no cookie.

## Four tabs

Each tab is its own view with its own address, so a view can be linked and the back button works.

| Tab | Address | What it does |
|---|---|---|
| Findings | `#findings` | the four steps of machine inspector qualification, one measured number each; the calibration-discrimination plane |
| Lab | `#lab?model=…&signal=…&deploy=…&alpha=…` | reruns conformal risk control in the browser on the stored model outputs; flags every setting the paper reports as matching or not |
| Answers | `#answers?story=…&qid=…` | illustrative benchmark items and what each of the six models wrote back, verbatim, with the decision rule's outcome |
| Reproducibility | `#repro` | recomputes all published conformal operating points live; the manuscript audit, SHA-256 fingerprints of every stored file, pinned model revisions, measured GPU hours |

Only `data/meta.json` (2 kB) loads at start. Every other file is fetched the first time the tab
that needs it opens.

The landing view plays a short automatic tour through the four tabs: the numbers count up, the
Lab sweeps the target and carries the threshold to new sites, and the Reproducibility tab
recomputes every published point. Any click, key or scroll stops it; the button in the corner
pauses and resumes. It never starts on a shared deep link or with reduced motion.

## Running it locally

`fetch` is blocked on `file://` URLs, so serve the folder:

```bash
cd 05_web_app
python -m http.server 8731
# then open http://127.0.0.1:8731
```

## Rebuilding the data

Everything in `data/` and `img/items/` is generated from the study's results, never hand-edited:

```powershell
cd "03_manuscript\working"; python check_manuscript.py      # writes audit_report.json
cd "..\..\02_analysis\15_web_app_data (web app)"
python run_analysis.py      # writes data/ and img/items/; refuses to write if a value fails
node check_lab_js.js        # runs js/crc.js under Node against every published result
python publish_hf_space.py  # refreshes the Hugging Face Space (needs HF_TOKEN)
```

`run_analysis.py` recomputes every published conformal operating point (432 of them) from the
exported slices alone before it writes anything, and `check_lab_js.js` does the same with the
browser's own code. Both must report every value matched. Then commit and push this folder;
GitHub Pages redeploys on push.

## What the site ships, and what it does not

- `data/lab/*.json`: for each model, the answers to the violation-type questions only (73,530 of
  the 159,968 stored answers), four fields each: confidence, stated confidence, whether the
  question was a real violation, and whether the answer was safe, unsafe or cannot determine.
  This is the minimum the Lab and the live recomputation need.
- `data/items.json` and `img/items/`: 49 illustrative items with resized images, from the two
  collections whose licenses allow redistribution, each shown with its creator, source and license.
- Not shipped: the full stored predictions, the hidden states and the fine-tuned adapters. The
  Reproducibility tab lists their SHA-256 fingerprints, which identify the exact files.

## License

Site code, text and data: CC BY-NC 4.0. Images and labels keep the terms of their source:

- ConstructionSite-10k ([Chen and Zou](https://huggingface.co/datasets/LouisChen15/ConstructionSite)):
  [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- SH17 ([Ahmad and Rahimi](https://github.com/ahmadmughees/SH17dataset)): photos from Pexels under
  the [Pexels License](https://www.pexels.com/license/); labels, and the SH17 questions derived
  from them, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

Images were resized and re-encoded as WebP; nothing else was changed.

## Files

| Path | Role |
|---|---|
| `index.html` | the shell: header, tab bar, four empty panels |
| `css/style.css` | the whole design system, palette shared with the paper figures |
| `js/fmt.js` | number formatting in the manuscript's style (.05, 8.3%, 16.8x) |
| `js/data.js` | loads each JSON once, on demand |
| `js/charts.js` | the SVG chart toolkit |
| `js/crc.js` | conformal risk control, written to match the paper's analysis bit for bit; also runs under Node |
| `js/findings.js`, `js/lab.js`, `js/answers.js`, `js/repro.js` | one module per tab |
| `js/motion.js` | numbers that count up to their value, marks that pop in |
| `js/tour.js` | the automatic tour and its play/pause button |
| `js/app.js` | the tab router |
| `CNAME` | the custom domain for GitHub Pages |
