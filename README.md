# BeatTheFly

*A Smart Fruit Fly is playing chess against you*

Play chess against a spiking neural network wired from the **real fruit-fly (Drosophila)
mushroom-body connectome** -- [MaleCNS](https://male-cns.janelia.org/) mushroom body, 4,510 neurons and
1,027,152 neuron-to-neuron connections, used under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).

Synaptic weights trained with PHCSSM parallel-scan mode, deployment in sequential RSNN mode ([PHCSSM](https://arxiv.org/abs/2604.01295)).

made by Po-Han Chiang @ NYCU

**Play:** https://phclab.github.io/BeatTheFly/  ·  **Weights:** [MushroomBody_Chess](https://huggingface.co/phclab/MushroomBody_Chess) on Hugging Face

## How to play
Open the page and wait for the weights to download (about 49 MB, cached by the browser afterwards).
Drag or click a piece to move. You can play White or Black, flip the board, take a move back, or let
the fly sample its move with a temperature instead of always playing its top choice.

## How it works
The page downloads the trained synaptic weights and runs the network in a Web Worker as plain
JavaScript; nothing is computed on a server. Each move is one timestep of a recurrent spiking
network: the move and the resulting board drive the Kenyon cells, spikes travel along the
connectome's synapses, dopaminergic neurons gate a fast associative memory on the Kenyon-cell-to-MBON
synapses, and a readout of the whole population's membrane voltage scores every move, restricted to
the legal ones. The neuron state carries over from move to move for the whole game. A short
numerical self-check against the reference implementation runs every time the page loads.

## Configuration
`config.js` sets `WEIGHTS_BASE`, the URL of the model folder. `index.html?weights=<url>` overrides it
for a single visit.

## License
Code: GPL-3.0-or-later (LICENSE, Copyright (c) 2026 Po-Han Chiang). Model weights: [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Connectome-derived data: CC-BY-4.0. Third-party code and full attribution: NOTICE.md.

## Citation
PHCSSM: https://arxiv.org/abs/2604.01295
