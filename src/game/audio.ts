export class GameAudio {
  private context: AudioContext | null = null;
  private last = 0;
  private lastSwing = -1;
  private lastBump = -1;
  private noise: AudioBuffer | null = null;
  enabled = true;
  unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    void this.context.resume();
  }
  play(kind: "hit" | "hurt" | "skill" | "level" | "swing" | "bump") {
    if (!this.enabled || !this.context || this.context.state !== "running")
      return;
    const t = this.context.currentTime;
    if (kind === "swing" || kind === "bump") {
      if (
        (kind === "swing" && t - this.lastSwing < 0.12) ||
        (kind === "bump" && t - this.lastBump < 0.18)
      )
        return;
      if (kind === "swing") this.lastSwing = t;
      else this.lastBump = t;
      if (!this.noise) {
        this.noise = this.context.createBuffer(
          1,
          Math.ceil(this.context.sampleRate * 0.2),
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const source = this.context.createBufferSource(),
        filter = this.context.createBiquadFilter(),
        gain = this.context.createGain();
      source.buffer = this.noise;
      filter.type = "bandpass";
      filter.Q.value = 0.7;
      filter.frequency.setValueAtTime(kind === "swing" ? 2600 : 400, t);
      filter.frequency.exponentialRampToValueAtTime(
        kind === "swing" ? 650 : 140,
        t + 0.14,
      );
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(
        kind === "swing" ? 0.055 : 0.025,
        t + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.context.destination);
      source.start(t);
      source.stop(t + 0.17);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      return;
    }
    if (t - this.last < 0.045 && kind === "hit") return;
    this.last = t;
    const o = this.context.createOscillator(),
      g = this.context.createGain();
    o.type = kind === "hurt" ? "triangle" : "sine";
    const freq = { hit: 420, hurt: 110, skill: 230, level: 720 }[kind];
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      kind === "level" ? 1100 : freq * 0.45,
      t + 0.12,
    );
    g.gain.setValueAtTime(0.035, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g);
    g.connect(this.context.destination);
    o.start(t);
    o.stop(t + 0.17);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
}
