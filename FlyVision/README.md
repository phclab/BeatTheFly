# FlyVision — see through a fruit fly's eyes

An in-browser demo: your camera is resampled to a fruit fly's compound-eye resolution
(~880 ommatidia per eye), and the optic lobe is run as a real LIF spiking network (RSNN)
on the fly's own wiring.

- Compound eye: two ommatidial arrays; luminance, lamina ON/OFF, and T4/T5 motion channels.
- Optic lobe (LIF-RSNN): 29,013 real optic-lobe neurons at their true 3D soma positions,
  wired by 316,504 real connectome edges, Dale-signed synapses (75% excitatory / 25% inhibitory
  from predicted neurotransmitter). Membrane -> threshold -> spike -> reset; lamina input is
  temporal contrast (motion) from the camera. Six fixed views.

Real vs estimated: the wiring (who connects to whom, synapse weights, E/I signs, soma positions)
is measured from the connectome; the single-neuron dynamics (membrane leak, threshold, synaptic
gain) are generic LIF values supplied for the demo. There are no trained weights.

All video is processed locally in the browser and never uploaded.

## License / attribution
- Code: GPL-3.0-or-later (repository LICENSE), consistent with the rest of BeatTheFly.
- Connectome-derived data (soma_ol_both.json, edges_ol_both.json, sign_ol.json): derived from the
  MaleCNS v1.0 connectome (Janelia FlyEM and collaborators, https://male-cns.janelia.org/),
  used under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/). Because the source is
  CC-BY-4.0, this data cannot be relicensed as non-commercial.
- No model weights (the demo runs the raw connectome with generic LIF dynamics), so nothing is
  hosted on Hugging Face.
- 3D rendering via three.js.
