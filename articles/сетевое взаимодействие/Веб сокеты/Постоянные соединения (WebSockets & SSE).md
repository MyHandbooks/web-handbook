---
tags: [angular, сетевое-взаимодействие, веб-сокеты, rxjs]
related: ["[[Интеграция с GraphQL]]", "[[Безопасность, Аутентификация и авторизация]]"]
status: "completed"
---

# Постоянные соединения (WebSockets & SSE)

## БЫСТРЫЙ СТАРТ

*   **Server-Sent Events (SSE)** — стандартизированный сетевой протокол однонаправленной передачи данных (Push) от сервера к клиенту в режиме реального времени, функционирующий поверх стандартного протокола HTTP.
*   **WebSockets (WS/WSS)** — двунаправленный (полнодуплексный) протокол обмена сообщениями, работающий по постоянному TCP-соединению после процедуры рукопожатия (Handshake) и переключения протокола (HTTP Upgrade).
*   **Используйте SSE для:** однонаправленных потоков данных от бэкенда к фронтенду (уведомления, ленты новостей, котировки, системные логи, прогресс выполнения тяжелых задач на сервере).
*   **Используйте WebSockets для:** интерактивного двустороннего обмена сообщениями в реальном времени с минимальной задержкой (чаты, совместное редактирование документов, многопользовательские игры).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Реактивный сервис и компонент для работы с Server-Sent Events (SSE)
*   **Назначение:** Описание сервиса для безопасной инициализации `EventSource` вне зоны выполнения Zone.js (для предотвращения лишних циклов Change Detection) и OnPush-компонента для отображения системных уведомлений.

#### 1. Файл логики сервиса: `sse.service.ts`
```typescript
import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root' // Глобальный синглтон
})
export class SseService {
  // Внедряем NgZone для контроля запусков Change Detection
  private readonly zone = inject(NgZone);

  connectToStream(endpointUrl: string): Observable<MessageEvent<string>> {
    return new Observable<MessageEvent<string>>((observer) => {
      let eventSource: EventSource | null = null;

      // Запускаем инициализацию вне контекста Zone.js.
      // Частые входящие push-события не будут триггерить перерисовку всего приложения.
      this.zone.runOutsideAngular(() => {
        eventSource = new EventSource(endpointUrl);

        // Перехватываем стандартное событие получения сообщения
        eventSource.onmessage = (event: MessageEvent<string>) => {
          // Возвращаем поток в зону выполнения Angular только при получении реальных данных,
          // чтобы обновить отображение конкретного OnPush компонента
          this.zone.run(() => {
            observer.next(event);
          });
        };

        // Обработка сетевых ошибок соединения
        eventSource.onerror = (error) => {
          this.zone.run(() => {
            observer.error(error);
          });
        };
      });

      // Функция очистки (Tear-down) вызывается автоматически при отписке (.unsubscribe())
      return () => {
        if (eventSource) {
          eventSource.close(); // Безопасно закрываем сетевое соединение в браузере
          eventSource = null;
        }
      };
    });
  }
}
```

#### 2. Файл логики компонента: `notification-center.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SseService } from './sse.service';

@Component({
  selector: 'app-notification-center',
  // standalone: true опущен по умолчанию в стандартах Angular 19+
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush исключает избыточный рендеринг
})
export class NotificationCenter implements OnInit {
  private readonly sseService = inject(SseService);

  // Реактивный сигнал для хранения списка входящих push-сообщений
  readonly notifications = signal<string[]>([]);
  readonly sseError = signal<string | null>(null);

  ngOnInit(): void {
    const sseUrl = '/api/realtime-notifications';

    // Подписываемся на реактивный поток от сервиса
    this.sseService.connectToStream(sseUrl)
      .pipe(takeUntilDestroyed()) // Безопасно отписываемся при уничтожении компонента
      .subscribe({
        next: (event) => {
          // Добавляем новое сообщение в начало массива в сигнале
          this.notifications.update(list => [event.data, ...list]);
          this.sseError.set(null);
        },
        error: () => {
          this.sseError.set('Ошибка соединения с сервером уведомлений (SSE).');
        }
      });
  }
}
```

#### 3. Файл разметки: `notification-center.html`
```html
<section class="notifications-panel">
  <header class="panel-header">
    <h3>Центр системных уведомлений (SSE)</h3>
  </header>

  @if (sseError(); as error) {
    <div class="error-banner" role="alert">
      <p>{{ error }}</p>
    </div>
  }

  <ul class="notifications-list">
    @for (message of notifications(); track $index) {
      <li class="notification-item">
        <span class="pulse-dot"></span>
        <p class="notification-text">{{ message }}</p>
      </li>
    } @empty {
      <p class="empty-state">Нет новых уведомлений.</p>
    }
  </ul>
</section>
```

#### 4. Файл стилей: `notification-center.css`
```css
.notifications-panel {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.panel-header {
  margin-bottom: 16px;
  color: var(--text-normal);
}

.error-banner {
  background-color: var(--error-bg);
  border: 1px solid var(--border);
  color: var(--error-text);
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 16px;
}

.notifications-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 6px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  background-color: var(--success-text);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.notification-text {
  color: var(--text-normal);
  font-size: 0.9rem;
}

.empty-state {
  color: var(--text-muted);
  font-style: italic;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.5; }
}
```

---

### Шаблон 2: Реактивный чат-клиент на базе WebSocketSubject (RxJS)
*   **Назначение:** Описание сервиса для работы с двунаправленным WebSocket-соединением с использованием RxJS `WebSocketSubject` (автоматическая сериализация/десериализация JSON-сообщений) и OnPush-компонента чата.

#### 1. Файл логики сервиса: `ws.service.ts`
```typescript
import { Injectable, OnDestroy } from '@angular/core';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { Observable, Subject } from 'rxjs';

// Описываем строгий интерфейс передаваемого JSON-пакета
export interface ChatMessage {
  sender: string;
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class WsService implements OnDestroy {
  // WebSocketSubject берет на себя всю рутину по сериализации/десериализации JSON в фреймы
  private socket$: WebSocketSubject<ChatMessage> | null = null;

  connectToSocket(socketUrl: string): Observable<ChatMessage> {
    if (!this.socket$) {
      // Инициализируем поток веб-сокета с конфигурацией
      this.socket$ = webSocket<ChatMessage>({
        url: socketUrl,
        // Опционально: перехватываем момент закрытия для логирования или реконнекта
        closingObserver: {
          next: () => console.log('Сетевое WebSocket-соединение закрывается...')
        }
      });
    }

    // Возвращаем сокет как стандартный Observable только для чтения
    return this.socket$.asObservable();
  }

  sendMessage(message: ChatMessage): void {
    if (this.socket$) {
      // Метод .next() автоматически сериализует объект в JSON и отправляет фрейм по TCP-каналу
      this.socket$.next(message);
    }
  }

  closeConnection(): void {
    if (this.socket$) {
      this.socket$.complete(); // Корректно завершаем поток и закрываем сокет в браузере
      this.socket$ = null;
    }
  }

  ngOnDestroy(): void {
    this.closeConnection();
  }
}
```

#### 2. Файл логики компонента: `chat-room.ts`
```typescript
import { Component, inject, signal, ChangeDetectionStrategy, OnInit, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WsService, ChatMessage } from './ws.service';

@Component({
  selector: 'app-chat-room',
  templateUrl: './chat-room.html',
  styleUrl: './chat-room.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatRoom implements OnInit, OnDestroy {
  private readonly wsService = inject(WsService);

  readonly chatHistory = signal<ChatMessage[]>([]);
  readonly isConnected = signal<boolean>(false);

  ngOnInit(): void {
    const wsUrl = 'wss://api.enterprise-app.com/v1/chat';

    this.wsService.connectToSocket(wsUrl)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (message) => {
          this.chatHistory.update(history => [...history, message]);
          this.isConnected.set(true);
        },
        error: (err) => {
          console.error('Ошибка в WebSocketSubject:', err);
          this.isConnected.set(false);
        }
      });
  }

  postMessage(messageText: string): void {
    if (!messageText.trim()) return;

    const payload: ChatMessage = {
      sender: 'CurrentUser',
      text: messageText
    };

    this.wsService.sendMessage(payload);
    // Локально добавляем отправленное сообщение в историю
    this.chatHistory.update(history => [...history, payload]);
  }

  ngOnDestroy(): void {
    this.wsService.closeConnection(); // Закрываем соединение при уходе с экрана
  }
}
```

#### 3. Файл разметки: `chat-room.html`
```html
<section class="chat-wrapper">
  <header class="chat-header">
    <h3>Интерактивный чат (WebSockets)</h3>
    <span class="status-indicator" [class.online]="isConnected()">
      {{ isConnected() ? 'В сети' : 'Офлайн' }}
    </span>
  </header>

  <div class="chat-messages">
    @for (msg of chatHistory(); track $index) {
      <div class="message-bubble" [class.self]="msg.sender === 'CurrentUser'">
        <p class="sender-name">{{ msg.sender }}</p>
        <p class="message-text">{{ msg.text }}</p>
      </div>
    } @empty {
      <p class="chat-empty">Сообщений пока нет. Начните диалог!</p>
    }
  </div>

  <div class="chat-footer">
    <input #textInput type="text" class="chat-input" placeholder="Введите сообщение..." (keyup.enter)="postMessage(textInput.value); textInput.value = ''" />
    <button class="send-btn" (click)="postMessage(textInput.value); textInput.value = ''">Отправить</button>
  </div>
</section>
```

#### 4. Файл стилей: `chat-room.css`
```css
.chat-wrapper {
  display: flex;
  flex-direction: column;
  height: 400px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

.status-indicator {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.status-indicator.online {
  color: var(--success-text);
  font-weight: 600;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-bubble {
  align-self: flex-start;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 70%;
}

.message-bubble.self {
  align-self: flex-end;
  background-color: var(--accent);
  color: #ffffff;
  border: none;
}

.sender-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 2px;
}

.message-bubble.self .sender-name {
  color: rgba(255, 255, 255, 0.8);
}

.message-text {
  font-size: 0.9rem;
}

.chat-empty {
  color: var(--text-muted);
  text-align: center;
  margin-top: auto;
  margin-bottom: auto;
  font-style: italic;
}

.chat-footer {
  display: flex;
  padding: 12px;
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border);
  gap: 12px;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

.send-btn {
  background-color: var(--accent);
  color: #ffffff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как устроен процесс переключения протокола (Handshake) в WebSockets
Протокол WebSockets (`ws` / `wss`) работает по собственной схеме передачи фреймов поверх TCP, но инициация соединения всегда выполняется по стандартным портам веб-трафика (`80` или `443`), чтобы обойти сетевые экраны (Firewalls) и прокси-серверы.

```text
Клиент (Браузер)                                          Сервер (Бэкенд)
       │                                                         │
       ├─────────────── 1. HTTP GET (Request Upgrade) ──────────►│
       │    Headers:                                             │
       │    Upgrade: websocket                                   │
       │    Connection: Upgrade                                  │
       │    Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==          │
       │                                                         │
       │◄────────────── 2. HTTP 101 Switching Protocols ─────────┤
       │    Headers:                                             │
       │    Upgrade: websocket                                   │
       │    Connection: Upgrade                                  │
       │    Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=   │
       │                                                         │
       │◄────────────── 3. Бинарный TCP-канал открыт ───────────►│ (Двунаправленные фреймы)
```

**Шаги установления соединения (Handshake):**
1.  **Запрос на переключение**: Браузер отправляет стандартный HTTP GET запрос. Ключевыми являются заголовки:
    *   `Upgrade: websocket` — указывает на желание клиента переключить протокол на WebSockets.
    *   `Connection: Upgrade` — сигнализирует промежуточным прокси о необходимости переключения соединения.
    *   `Sec-WebSocket-Key` — случайная закодированная Base64 строка, используемая для проверки, что сервер понимает протокол.
2.  **Ответ сервера**: Если сервер поддерживает WebSockets, он возвращает ответ со статус-кодом **`101 Switching Protocols`**. В ответе содержится заголовок `Sec-WebSocket-Accept`, который является результатом SHA-1 хэширования строки ключа клиента со специальной системной солью UUID. Это защищает от кэширования ответов прокси-серверами.
3.  **Переключение в TCP**: С этого момента HTTP-сессия завершается. Клиент и сервер общаются легковесными бинарными или текстовыми фреймами (Frames) напрямую по открытому TCP-каналу с минимальными накладными расходами (размер заголовка фрейма составляет всего от 2 до 10 байт).

---

### 2. Сравнение архитектурных особенностей: WebSockets vs SSE
Выбор между технологиями базируется на специфике взаимодействия с бэкендом:

| Критерий | WebSockets | Server-Sent Events (SSE) |
| :--- | :--- | :--- |
| **Направление передачи** | Двунаправленное (Full-Duplex) | Однонаправленное (Server-to-Client) |
| **Протокол** | Собственный протокол (`ws` / `wss`) | Стандартный HTTP/1.1 или HTTP/2 |
| **Авто-реконнект** | Требует ручной реализации на клиенте | Встроен по умолчанию на уровне браузера |
| **Формат данных** | Текстовый (JSON) и бинарный (Blob/ArrayBuffer) | Исключительно текст (`text/event-stream`) |
| **Лимиты соединений** | Не ограничены спецификацией браузера | Ограничены в HTTP/1.1 (6 штук на домен) |

---

### 3. Детальный пошаговый разбор выполнения шаблона 2
1.  **Создание WebSocketSubject**: При первом вызове `connectToSocket` создается экземпляр `WebSocketSubject`. Соединение с сервером на этом этапе еще не открывается (ленивый поток).
2.  **Подписка**: Когда компонент `ChatRoom` подписывается на поток, `WebSocketSubject` инициирует реальное сетевое WebSocket-рукопожатие с сервером.
3.  **Переключение в ONLINE**: После успешного получения статуса `101`, сокет переходит в статус `OPEN`, а сигнал `isConnected` принимает значение `true`.
4.  **Отправка данных**: При вызове `wsService.sendMessage(payload)` метод `socket$.next()` сериализует объект `payload` в JSON-строку и отправляет текстовый фрейм в открытый TCP-канал.
5.  **Получение сообщения**: При поступлении фрейма от сервера `WebSocketSubject` автоматически парсит входящую JSON-строку обратно в типизированный объект `ChatMessage` и передает его в поток `.subscribe()`, обновляя сигнал истории чата `chatHistory`.
6.  **Уничтожение**: При уничтожении компонента `ChatRoom` срабатывает метод `ngOnDestroy()`, вызывающий `complete()` у сокета. Поток закрывается, отправляя TCP-пакет `Close` серверу.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Блокировка рендеринга и зависание OnPush компонентов при фоновом потоке данных**
    *   *Симптомы:* Медленная отрисовка интерфейса, лаги, зависание приложения при получении десятков сообщений в секунду, даже если сам OnPush компонент не отображает эти данные.
    *   *Физика процесса:* Каждое асинхронное событие, проходящее через нативный `EventSource` или `WebSocket` в зоне Angular, заставляет библиотеку Zone.js триггерить глобальную проверку изменений (`ApplicationRef.tick()`) для всего дерева компонентов, тратя процессорное время на пустой обход DOM.
    *   *Решение:* Инициализируйте соединения строго вне контекста Zone.js с помощью метода `NgZone.runOutsideAngular()`, и возвращайте поток в зону выполнения через `NgZone.run()` только тогда, когда полученные данные действительно требуют перерисовки UI.

```typescript
// ПЛОХО (Каждое сообщение триггерит тяжелый глобальный обход CD Zone.js для всего приложения)
this.socket.onmessage = (event) => {
  this.dataSignal.set(event.data); // Вызовет глобальный Change Detection
};

// ХОРОШО (Изолируем сетевой поток вне зоны Angular, возвращаясь только при необходимости обновить UI)
private zone = inject(NgZone);

this.zone.runOutsideAngular(() => {
  this.socket.onmessage = (event) => {
    this.zone.run(() => {
      this.dataSignal.set(event.data); // ✅ Обновит только OnPush компонент
    });
  };
});
```

*   **Ошибка 2: Утечка соединений при отсутствии явной отписки**
    *   *Симптомы:* Переполнение лимита открытых сокетов на сервере, постепенное падение производительности браузера на клиенте при переходах между страницами.
    *   *Физика процесса:* Если компонент уничтожается, но подписка на `WebSocketSubject` или `EventSource` остается активной, соединение в браузере не закроется автоматически. Оно продолжит висеть в памяти вкладки.
    *   *Решение:* Всегда вызывайте метод `.complete()` у `WebSocketSubject` или метод `.close()` у `EventSource` при уничтожении компонента (используйте хук `ngOnDestroy` или оператор `takeUntilDestroyed`).

```typescript
// ПЛОХО (При уходе с экрана сокет останется жить в сети)
export class BadChat {
  private wsService = inject(WsService);
  ngOnInit() {
    this.wsService.connectToSocket('wss://...').subscribe(); // ❌ Утечка сокета
  }
}
```

*   **Ошибка 3: Проблема авторизации через кастомные заголовки в `EventSource` (SSE)**
    *   *Симптомы:* Запрос на установку SSE-соединения падает со статусом `401 Unauthorized`.
    *   *Физика процесса:* Нативный браузерный класс `EventSource` не поддерживает передачу кастомных HTTP-заголовков (таких как `Authorization: Bearer <token>`) при инициализации соединения.
    *   *Решение:* Передавайте токен авторизации через зашифрованный куки-файл с флагом `HttpOnly` (включая свойство `withCredentials: true` в настройках EventSource) либо используйте стороннюю библиотеку (например, `@microsoft/fetch-event-source`), которая заменяет `EventSource` под капотом на стандартный `fetch` с поддержкой любых заголовков.

```typescript
// ПЛОХО (Невозможно передать токен авторизации в заголовках стандартного EventSource)
const es = new EventSource('/api/sse'); // ❌ Упадет с 401

// ХОРОШО (Способ А: Передача токена через Cookie-файлы за счет включения withCredentials)
const esCredentials = new EventSource('/api/sse', { withCredentials: true }); // ✅ Сработает, если настроены Cookies

// ХОРОШО (Способ Б: Передача токена через Query-параметры URL)
const token = 'jwt_token_value';
const esQuery = new EventSource(`/api/sse?auth_token=${encodeURIComponent(token)}`); // ✅ Передача в URL
```
