import { VOICE_SAMPLE_RATE, voiceWav } from "@/domain/voiceAudio";

/** Decode the browser's native container (WebM / Ogg / MP4) before sending a consistent speech format. */
export async function encodeRecording(blob: Blob): Promise<string> {
  const context = new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  if (audio.duration < 0.15) throw new Error("That recording was too short. Try speaking for a moment longer.");
  // Request a mono microphone. On devices that supply stereo, mix both channels.
  const samples = audio.getChannelData(0).slice();
  for (let channel = 1; channel < audio.numberOfChannels; channel++) {
    const next = audio.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] += next[i];
  }
  if (audio.numberOfChannels > 1) for (let i = 0; i < samples.length; i++) samples[i] /= audio.numberOfChannels;
  const wav = new Blob([voiceWav(samples)], { type: "audio/wav" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Couldn’t read the voice recording."));
    reader.readAsDataURL(wav);
  });
}
