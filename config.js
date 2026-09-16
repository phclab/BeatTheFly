window.FLY_CONFIG = {
  chess: { WEIGHTS_BASE: 'weights/MushroomBody_Chess/', PRECISION: 'fp16w32', REGIONS: {
    al: { WEIGHTS_BASE: 'weights/AntennalLobe_Chess/', PRECISION: 'fp16w32' },
    cx: { WEIGHTS_BASE: 'weights/CentralComplex_Chess/', PRECISION: 'fp16w32' },
  } },
  othello: { WEIGHTS_BASE: 'weights/MushroomBody_Othello/', PRECISION: 'fp16w32' },
  pong: { BRAINS: {
    cx: { WEIGHTS_BASE: 'weights/CentralComplex_Pong/', PRECISION: 'fp16w32' },
    al: { WEIGHTS_BASE: 'weights/AntennalLobe_Pong/', PRECISION: 'fp16w32' },
    mb: { WEIGHTS_BASE: 'weights/MushroomBody_Pong/', PRECISION: 'fp16w32' },
  } },
};
