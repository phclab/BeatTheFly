// SPDX-License-Identifier: GPL-3.0-or-later
window.FLY_CONFIG = {
  chess: { WEIGHTS_BASE: 'https://huggingface.co/phclab/MushroomBody_Chess/resolve/main/', PRECISION: 'fp16w32', REGIONS: {
    al: { WEIGHTS_BASE: 'https://huggingface.co/phclab/AntennalLobe_Chess/resolve/main/', PRECISION: 'fp16w32' },
    cx: { WEIGHTS_BASE: 'https://huggingface.co/phclab/CentralComplex_Chess/resolve/main/', PRECISION: 'fp16w32' },
  } },
  othello: { WEIGHTS_BASE: 'https://huggingface.co/phclab/MushroomBody_Othello/resolve/main/', PRECISION: 'fp16w32' },
  pong: { BRAINS: {
    cx: { WEIGHTS_BASE: 'https://huggingface.co/phclab/CentralComplex_Pong/resolve/main/', PRECISION: 'fp16w32' },
    al: { WEIGHTS_BASE: 'https://huggingface.co/phclab/AntennalLobe_Pong/resolve/main/', PRECISION: 'fp16w32' },
    mb: { WEIGHTS_BASE: 'https://huggingface.co/phclab/MushroomBody_Pong/resolve/main/', PRECISION: 'fp16w32' },
  } },
};
