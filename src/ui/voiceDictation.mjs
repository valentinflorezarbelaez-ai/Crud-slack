/**
 * VOICE DICTATION CONTROLLER (Web Speech API)
 * Transcribes spoken requests in real-time into the Slack message composer.
 * Gracefully handles unsupported browsers without errors.
 */

export function setupVoiceDictation({ micBtn, inputMessage, onTranscriptChange, showToast }) {
  if (!micBtn || !inputMessage) return;

  const SpeechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  if (!SpeechRecognition) {
    micBtn.setAttribute("title", "Dictado por voz no soportado en este navegador.");
    micBtn.setAttribute("disabled", "true");
    return;
  }

  let recognition = null;
  let isListening = false;

  function stopListening() {
    if (recognition && isListening) {
      recognition.stop();
    }
    isListening = false;
    micBtn.classList.remove("is-recording");
    micBtn.setAttribute("aria-pressed", "false");
    micBtn.setAttribute("title", "Dictar mensaje por voz");
  }

  micBtn.addEventListener("click", () => {
    if (isListening) {
      stopListening();
      showToast("Dictado por voz finalizado.");
      return;
    }

    try {
      recognition = new SpeechRecognition();
      recognition.lang = "es-ES";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListening = true;
        micBtn.classList.add("is-recording");
        micBtn.setAttribute("aria-pressed", "true");
        micBtn.setAttribute("title", "Escuchando... haz clic para detener");
        showToast("🎙️ Micrófono activo: habla ahora en español.");
      };

      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          inputMessage.value = transcript.trim();
          if (typeof onTranscriptChange === "function") {
            onTranscriptChange();
          }
        }
      };

      recognition.onerror = () => {
        stopListening();
        showToast("No se pudo capturar audio o se denegó el permiso del micrófono.");
      };

      recognition.onend = () => {
        stopListening();
      };

      recognition.start();
    } catch {
      stopListening();
      showToast("Error al inicializar el reconocimiento de voz.");
    }
  });
}
