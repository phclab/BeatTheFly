# BeatTheFly

*A Smart Fruit Fly is playing chess against you* · *A Smart Fruit Fly is playing Othello against you*

**The anatomical connectome gives you wiring, not synaptic strengths. Ours are trained.**

Play chess or Othello against a spiking neural network wired from the **real fruit-fly (Drosophila)
mushroom-body connectome** -- [MaleCNS](https://male-cns.janelia.org/) mushroom body, 4,510 neurons and
1,027,152 neuron-to-neuron connections, used under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). Each game has its own trained
synaptic weights on the same wiring.

Synaptic weights trained with PHCSSM parallel-scan mode, deployment in sequential RSNN mode ([PHCSSM](https://arxiv.org/abs/2604.01295)).

made by Po-Han Chiang @ NYCU

**Play:** https://phclab.github.io/BeatTheFly/  ·  **Weights:** [MushroomBody_Chess](https://huggingface.co/phclab/MushroomBody_Chess),
[AntennalLobe_Chess](https://huggingface.co/phclab/AntennalLobe_Chess), [CentralComplex_Chess](https://huggingface.co/phclab/CentralComplex_Chess) and
[MushroomBody_Othello](https://huggingface.co/phclab/MushroomBody_Othello) on Hugging Face

## How to play
Open the page and pick a game. Each game page downloads only its own weights (chess about
49.5 MB, Othello about 7.6 MB; cached by the browser afterwards).

* **Chess** (`chess/`): drag or click a piece to move. Play White or Black, flip the board, take a move
  back, or let the fly sample its move with a temperature instead of always playing its top choice.
  Choose which fly brain region you play against: the mushroom body (default), the central complex or
  the antennal lobe. Each region has its own trained weights on its own wiring and is loaded only
  when selected.
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
`config.js` sets `WEIGHTS_BASE` for each game and each chess brain region, the URL of its model folder. `chess/?weights=<url>`
or `othello/?weights=<url>` overrides it for a single visit.

## License
Copyright (C) 2026 Po-Han Chiang

The code is free software: you can redistribute it and/or modify it under the terms of the GNU General
Public License as published by the Free Software Foundation, either version 3 of the License, or (at your
option) any later version (GPL-3.0-or-later). See LICENSE. It is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY.

The model weights loaded by the page are not covered by the code license: [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Connectome-derived data: CC-BY-4.0. Third-party code and full attribution: NOTICE.md.

## Citation
PHCSSM: https://arxiv.org/abs/2604.01295
