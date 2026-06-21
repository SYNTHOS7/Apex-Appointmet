(function() {
  // Prevent duplicate script injection
  if (window.__ApexAiAppointmentSetterLoaded) return;
  window.__ApexAiAppointmentSetterLoaded = true;

  // Resolve hosting origin dynamically from the script source
  const scriptTag = document.getElementById('ai-appointment-setter') || document.currentScript;
  const scriptSrc = scriptTag ? scriptTag.src : 'http://localhost:3000/widget.js';
  const origin = new URL(scriptSrc).origin;
  const iframeUrl = `${origin}/widget`;

  // Inject widget CSS styles
  const styles = `
    #apex-chat-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
      box-shadow: 0 4px 20px rgba(245, 158, 11, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 999999;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
    #apex-chat-trigger:hover {
      transform: scale(1.1) rotate(5deg);
      box-shadow: 0 6px 24px rgba(245, 158, 11, 0.6);
    }
    #apex-chat-trigger:active {
      transform: scale(0.95);
    }
    #apex-chat-trigger svg {
      width: 28px;
      height: 28px;
      fill: none;
      stroke: white;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      transition: transform 0.3s ease;
    }
    #apex-chat-iframe-container {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 400px;
      height: 600px;
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
      border: none;
      z-index: 999999;
      overflow: hidden;
      transform: translateY(20px) scale(0.9);
      opacity: 0;
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      transform-origin: bottom right;
    }
    #apex-chat-iframe-container.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #apex-chat-iframe-container iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #080a10;
    }
    
    @media (max-width: 480px) {
      #apex-chat-iframe-container {
        width: calc(100% - 32px);
        height: calc(100% - 100px);
        bottom: 84px;
        right: 16px;
      }
      #apex-chat-trigger {
        bottom: 16px;
        right: 16px;
        width: 52px;
        height: 52px;
      }
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.type = 'text/css';
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Create Chat Trigger Button
  const trigger = document.createElement('div');
  trigger.id = 'apex-chat-trigger';
  trigger.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
  `;
  document.body.appendChild(trigger);

  // Create iframe Container
  const container = document.createElement('div');
  container.id = 'apex-chat-iframe-container';
  container.innerHTML = `<iframe src="${iframeUrl}" title="Apex AI Support" allow="microphone"></iframe>`;
  document.body.appendChild(container);

  // Toggle Functionality
  let isOpen = false;

  function toggleChat() {
    isOpen = !isOpen;
    if (isOpen) {
      container.classList.add('open');
      trigger.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    } else {
      container.classList.remove('open');
      trigger.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      `;
    }
  }

  trigger.addEventListener('click', toggleChat);

  // Listen to toggle events from inside the iframe
  window.addEventListener('message', function(event) {
    if (event.origin !== origin) return;
    if (event.data && event.data.type === 'toggle-chat') {
      toggleChat();
    }
  });

})();
