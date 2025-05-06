// utils/audio.buffer.queue.js

export class AudioBufferQueue {
    constructor() {
      this.queue = [];
    }
  
    enqueue(chunk) {
      this.queue.push(chunk);
    }
  
    dequeue() {
      if (this.queue.length === 0) {
        return null;
      }
      return this.queue.shift();
    }
  
    peek() {
      return this.queue[0] || null;
    }
  
    clear() {
      this.queue = [];
    }
  
    size() {
      return this.queue.length;
    }
  
    isEmpty() {
      return this.queue.length === 0;
    }
  }
  