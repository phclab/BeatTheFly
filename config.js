// SPDX-License-Identifier: GPL-3.0-or-later
// Location of the model folder (manifest.json, info.json, fp16/, fp32/).
// A single visit can override it with index.html?weights=<url>
window.FLY_CONFIG = {
  WEIGHTS_BASE: 'https://huggingface.co/phclab/MushroomBody_Chess/resolve/main/',
  PRECISION: 'fp16w32',
};
