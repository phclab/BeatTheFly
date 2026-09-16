# FlyVision — see through a fruit fly's eyes

An in-browser demo: your camera is resampled to a fruit fly's compound-eye resolution
(~880 ommatidia per eye), and the optic lobe is run as a real **LIF spiking network (RSNN)**
on the fly's own wiring.

- **Compound eye**: two ommatidial arrays; luminance, lamina ON/OFF, and T4/T5 motion channels.
- **Optic lobe (LIF-RSNN)**: 29,013 real optic-lobe neurons at their true 3D soma positions,
  wired by **316,504 real connectome edges**, with Dale-signed synapses (75% excitatory /
  25% inhibitory from predicted neurotransmitter). Membrane → threshold → spike → reset;
  lamina input is temporal contrast (motion) from the camera. 6 fixed views.

**Real vs estimated:** the *wiring* (who connects to whom, synapse weights, E/I signs, soma
positions) is measured from the connectome; the *single-neuron dynamics* (membrane leak,
threshold, synaptic gain) are generic LIF values supplied for the demo — a connectome gives a
wiring diagram, not calibrated biophysics.

All video is processed locally in the browser and never uploaded.

## Data / attribution
Connectivity, neurotransmitter and soma coordinates derived from the **MaleCNS v1.0** connectome
(Janelia / FlyEM), used under **CC-BY-4.0**. 3D rendering via three.js.
