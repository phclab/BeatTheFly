# BeatTheFly

*A Smart Fruit Fly is playing chess against you* · *A Smart Fruit Fly is playing Othello against you*

**The anatomical connectome gives you wiring, not synaptic strengths. Ours are trained.**

Play chess or Othello against a spiking neural network wired from the **real fruit-fly (Drosophila)
mushroom-body connectome** -- [MaleCNS](https://male-cns.janelia.org/) mushroom body, 4,510 neurons and
1,027,152 neuron-to-neuron connections, used under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Each game has its own trained
synaptic weights on the same wiring.

Synaptic weights trained with PHCSSM parallel-scan mode, deployment in sequential RSNN mode ([PHCSSM](https://arxiv.org/abs/2604.01295)).

made by Po-Han Chiang @ NYCU

**Play:** https://phclab.github.io/BeatTheFly/  ·  **Weights:** [MushroomBody_Chess](https://huggingface.co/phclab/MushroomBody_Chess) and
[MushroomBody_Othello](https://huggingface.co/phclab/MushroomBody_Othello) on Hugging Face

## How to play
Open the page and pick a game. Each game page downloads only its own weights (chess about
49.5 MB, Othello about 7.6 MB; cached by the browser afterwards).

* **Chess** (`chess/`): drag or click a piece to move. Play White or Black, flip the board, take a move
  back, or let the fly sample its move with a temperature instead of always playing its top choice.
* **Othello** (`othello/`): click a highlighted square to place a disc. Play Black or White, flip the
  board, take a move back or sample with a temperature. When a side has no legal square it passes;
  the game ends when neither side can move.

## How it works
Chess: Data sources: human games from the [Lichess open database](https://database.lichess.org/) (lichess.org, CC0); move labels from the [Stockfish](https://stockfishchess.org/) chess engine.

Othello: Data source: [Egaroucid Free Training Data](https://www.egaroucid.nyanyan.dev/en/technology/train-data/) (Takuto Yamana).

The page downloads the trained synaptic weights and runs the network in a Web Worker as plain
JavaScript; nothing is computed on a server. Each move is one timestep of a recurrent spiking
network: the move and the resulting board drive the Kenyon cells, spikes travel along the
connectome's synapses, dopaminergic neurons gate a fast associative memory on the Kenyon-cell-to-MBON
synapses, and a readout of the whole population's membrane voltage scores every move, restricted to
the legal ones. The neuron state carries over from move to move for the whole game. A short
numerical self-check against the reference implementation runs every time a game page loads.

## Configuration
`config.js` sets `WEIGHTS_BASE` for each game, the URL of its model folder. `chess/?weights=<url>`
or `othello/?weights=<url>` overrides it for a single visit.

## License
Code: GPL-3.0-or-later (LICENSE, Copyright (c) 2026 Po-Han Chiang). Model weights: [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Connectome-derived data: CC-BY-4.0. Third-party code and full attribution: NOTICE.md.

## Citation
PHCSSM: https://arxiv.org/abs/2604.01295
