# Third-party components and data

The code in this repository is licensed under GPL-3.0-or-later (see LICENSE). The following are not:

* `vendor/chess.esm.js` -- chess.js, Copyright (c) Jeff Hlywa, BSD-2-Clause (see `vendor/LICENSE.chessjs`).
* `data/mb_skel.json` and the neuron metadata shown on the pages -- derived from MaleCNS v1.0
  (Janelia FlyEM and collaborators, https://male-cns.janelia.org/), licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/).
* The chess model weights (MushroomBody_Chess), loaded from https://huggingface.co/phclab/MushroomBody_Chess -- CC-BY-NC-4.0 (https://creativecommons.org/licenses/by-nc/4.0/).
* The Othello model weights (MushroomBody_Othello), loaded from https://huggingface.co/phclab/MushroomBody_Othello -- CC-BY-NC-4.0 (https://creativecommons.org/licenses/by-nc/4.0/).

* The chess brain-region weights (AntennalLobe_Chess, loaded from https://huggingface.co/phclab/AntennalLobe_Chess, CentralComplex_Chess, loaded from https://huggingface.co/phclab/CentralComplex_Chess)
  -- CC-BY-NC-4.0 (https://creativecommons.org/licenses/by-nc/4.0/).
* `data/skel_*.json` (brain-region neuron skeletons) -- derived from MaleCNS v1.0, CC-BY-4.0.

All weights are derived from the CC-BY-4.0 connectome and trained with PHCSSM (https://arxiv.org/abs/2604.01295).

Chess: Data sources: human games from the [Lichess open database](https://database.lichess.org/) (lichess.org, CC0); move labels from the [Stockfish](https://stockfishchess.org/) chess engine.

Othello: Data source: [Egaroucid Free Training Data](https://www.egaroucid.nyanyan.dev/en/technology/train-data/) (Takuto Yamana).
