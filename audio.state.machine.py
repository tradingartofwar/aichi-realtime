from enum import Enum, auto
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

class AudioState(Enum):
    LISTENING = auto()
    PROCESSING = auto()
    RESPONDING = auto()

class AudioStateMachine:
    def __init__(self):
        self.state = AudioState.LISTENING
        logging.info(f"Initial state: {self.state}")

    def transition_to(self, new_state):
        logging.info(f"Transitioning from {self.state} to {new_state}")
        self.state = new_state
        self.handle_state()

    def handle_state(self):
        if self.state == AudioState.LISTENING:
            self.handle_listening()
        elif self.state == AudioState.PROCESSING:
            self.handle_processing()
        elif self.state == AudioState.RESPONDING:
            self.handle_responding()

    def handle_listening(self):
        logging.info("State: LISTENING - Capturing audio...")

    def handle_processing(self):
        logging.info("State: PROCESSING - Transcribing and analyzing...")

    def handle_responding(self):
        logging.info("State: RESPONDING - Playing TTS response...")

if __name__ == "__main__":
    sm = AudioStateMachine()
    sm.transition_to(AudioState.PROCESSING)
    sm.transition_to(AudioState.RESPONDING)
    sm.transition_to(AudioState.LISTENING)
