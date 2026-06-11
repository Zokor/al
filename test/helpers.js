import { Writable } from "node:stream";

export function captureStream() {
  let text = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString();
      callback();
    },
  });
  stream.isTTY = false;
  return {
    stream,
    text: () => text,
  };
}
