
const TranscribeAudio = require('./transcribeAudio');

async function transcribeAudioFile() {
  try {
    const transcriber = new TranscribeAudio();

    const result = await transcriber.transcribe('output2.wav');
    console.log(result);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

transcribeAudioFile();

// const recorder = require("./recorder");

// const fs = require('fs')

// const file = fs.createWriteStream('output2.wav', { encoding: 'binary' })
// const recording = recorder.record()
// recording.stream().pipe(file)

// // Pause recording after one second
// setTimeout(() => {
//   recording.pause()
// }, 2000)

// // Stop recording after three seconds
// setTimeout(() => {
//   recording.stop()
// }, 3000)