---
tags: [angular, RxJS, буферизация, производительность, архитектура]
related: ["[[Анатомия конвейера pipe и базовые операторы обработки (map, filter, tap).md]]", "[[Управление временными задержками (debounceTime, throttleTime, auditTime, delay).md]]", "[[Преобразования RxJS потоков (switchMap, concatMap).md]]"]
status: "completed"
---

# Пакетная обработка и буферизация (bufferTime, bufferCount, windowTime)

## БЫСТРЫЙ СТАРТ

*   **Операторы буферизации (`Buffer` и `Window`)** — инструменты RxJS, которые собирают множество дискретных входящих событий во временные группы (пакеты/чанки), предотвращая перегрузку сети и графического процессора при высокочастотных потоках данных.
*   **Три фундаментальных оператора:**
    *   `bufferTime(timespan, creationInterval, maxBufferSize)` — накапливает события за указанный временной интервал `timespan` и испускает их в виде **единого массива**. Идеально для пакетной отправки метрик аналитики и логов.
    *   `bufferCount(bufferSize, startBufferEvery)` — накапливает ровно `bufferSize` элементов и испускает массив. Используется для группировки пользовательских действий (например, определение двойного или тройного клика).
    *   `windowTime(timespan)` — похож на `bufferTime`, но вместо массива испускает **вложенный Observable** (окно потока). Позволяет применять RxJS-операторы к элементам прямо внутри текущего временного окна без ожидания его закрытия.
*   **Используйте для:** пакетной отправки телеметрии и логов на сервер (Batching), оптимизации отрисовки потока WebSocket-сообщений и реализации сложных жестов или кликов.
*   **Не используйте `bufferTime` без фильтрации пустых массивов:** по умолчанию оператор будет регулярно испускать пустые массивы каждые N секунд, даже если событий в источнике не было.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Пакетная отправка аналитики на сервер (`bufferTime`)
*   **Назначение:** Сервис телеметрии собирает пользовательские клики и переходы в памяти и отправляет их на бэкенд пачками каждые 4 секунды (или по накоплению 20 событий), сокращая количество HTTP-запросов в десятки раз.

```typescript
import { Injectable, inject, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { bufferTime, filter, concatMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface TelemetryEvent {
  eventType: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class TelemetryBatchService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly endpoint = 'https://api.enterprise-service.com/v1/telemetry/batch';

  // Внутренняя шина входящих событий аналитики
  private readonly eventStream$ = new Subject<TelemetryEvent>();

  constructor() {
    this.eventStream$.pipe(
      // Собираем события в массив за каждые 4000мс (4 сек)
      // Либо сбрасываем пакет раньше, если накопилось 20 элементов (maxBufferSize)
      bufferTime(4000, null, 20),

      // Отсекаем пустые такты таймера (когда за 4 секунды не произошло ни одного события)
      filter((eventsBatch) => eventsBatch.length > 0),

      // Последовательно отправляем пачки на сервер
      concatMap((batch) => {
        console.log(`[Telemetry] Отправка пакета из ${batch.length} событий на сервер...`);
        return this.http.post(this.endpoint, { events: batch }).pipe(
          catchError((err: Error) => {
            console.error('[Telemetry] Ошибка отправки пакета:', err);
            return of(null);
          })
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  /**
   * Добавляет событие в очередь пакетной отправки
   */
  public logEvent(eventType: string, payload: Record<string, unknown> = {}): void {
    this.eventStream$.next({
      eventType,
      timestamp: Date.now(),
      payload
    });
  }
}
```

---

### Шаблон 2: Распознавание мульти-кликов через скользящий `bufferCount`
*   **Назначение:** Определение тройного клика (Triple Click) по элементу интерфейса с использованием перекрывающегося буфера (`startBufferEvery`).

#### 1. Файл логики компонента: `secret-code-trigger.ts`
```typescript
import { Component, ChangeDetectionStrategy, viewChild, ElementRef, OnInit, inject, DestroyRef, signal } from '@angular/core';
import { fromEvent } from 'rxjs';
import { bufferCount, filter, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-secret-code-trigger',
  templateUrl: './secret-code-trigger.html',
  styleUrl: './secret-code-trigger.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecretCodeTrigger implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  private readonly secretBtn = viewChild.required<ElementRef<HTMLButtonElement>>('secretBtn');

  public readonly isUnlocked = signal<boolean>(false);

  public ngOnInit(): void {
    const buttonNode = this.secretBtn().nativeElement;

    // Слушаем клики по кнопке
    fromEvent<MouseEvent>(buttonNode, 'click').pipe(
      map(() => Date.now()), // Преобразуем клик во временную метку
      
      // Буферизуем по 3 клика, сдвигая буфер на 1 клик вперед при каждом новом событии
      bufferCount(3, 1),

      // Проверяем: если разница во времени между 1-м и 3-м кликом меньше 600мс — это тройной клик
      filter((timestamps: number[]) => {
        const [firstClick, , thirdClick] = timestamps;
        return thirdClick - firstClick < 600;
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      console.warn('[Security] Зафиксирован быстрый тройной клик! Режим разработчика разблокирован.');
      this.isUnlocked.set(true);
    });
  }
}
```

#### 2. Файл разметки компонента: `secret-code-trigger.html`
```html
<div class="secret-box">
  <button #secretBtn type="button" class="action-btn">
    Нажми меня 3 раза быстро
  </button>

  @if (isUnlocked()) {
    <div class="unlocked-banner">
      <p>🔓 Доступ к скрытым настройкам открыт!</p>
    </div>
  }
</div>
```

#### 3. Файл стилей компонента: `secret-code-trigger.css`
```css
.secret-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 320px;
}

.action-btn {
  padding: 8px 16px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  width: 100%;
}

.unlocked-banner {
  margin-top: 12px;
  padding: 10px;
  background-color: var(--success-bg);
  border: 1px solid var(--border);
  color: var(--success-text);
  border-radius: 6px;
  text-align: center;
}
```

---

### Шаблон 3: Подсчет скорости кликов через `windowTime`
*   **Назначение:** Измерение частоты действий пользователя (кликов в секунду / CPS) с помощью вложенных окон времени.

```typescript
import { Injectable } from '@angular/core';
import { fromEvent, Observable } from 'rxjs';
import { windowTime, switchMap, count } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ClickSpeedMeasurer {
  /**
   * Возвращает поток, испускающий количество кликов за каждую прошедшую секунду
   */
  public measureClicksPerSecond(targetElement: HTMLElement): Observable<number> {
    return fromEvent(targetElement, 'click').pipe(
      // Каждую 1 секунду (1000мс) открывает новое окно-поток
      windowTime(1000),

      // switchMap переключается на внутренний Observable окна и выполняет над ним оператор count()
      switchMap((window$) => window$.pipe(count()))
    );
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Внутреннее устройство: `bufferTime` против `windowTime`

```text
Входящий поток:    ---(e1)-----(e2)---------(e3)----------(e4)-------->
Временная шкала:  |--------- 1 сек ---------|--------- 2 сек ---------|

1. bufferTime(1000):
Результат:         ------------------------[e1, e2]------------------[e3, e4]-->
                   (Испускает ГОТОВЫЙ МАССИВ в момент закрытия интервала)

2. windowTime(1000):
Результат:         ---(Observable 1)---------(Observable 2)----------->
                      \-(e1)-(e2)-|             \-(e3)-(e4)-|
                   (Испускает ПОТОК в начале окна, значения текут сразу)
```

*   **`bufferTime`** задерживает данные. Элементы складываются во внутренний JS-массив в куче (Heap). Подписчик не узнает о событиях e1 и e2 до тех пор, пока не истечет 1000мс.
*   **`windowTime`** не задерживает доставку. Он мгновенно порождает вложенный Observable. Значения e1 и e2 пролетают сквозь него в реальном времени, что позволяет накладывать операторы фильтрации или раннего прерывания (`take`) прямо во время активного окна.

### 2. Физика параметров `bufferTime(timespan, creationInterval, maxBufferSize)`
*   `timespan` — продолжительность наполнения одного буфера (в миллисекундах).
*   `creationInterval` — если передан, задает интервал открытия **новых перекрывающихся буферов**. Если creationInterval меньше timespan, одно и то же событие попадет в несколько соседних пакетов.
*   `maxBufferSize` — защитный ограничитель. Если за время окна поступило больше элементов, чем указано в maxBufferSize, буфер сбрасывается досрочно, не дожидаясь таймера, что предотвращает переполнение памяти при лавинообразных входящих событиях.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Пропуск фильтрации пустых массивов в `bufferTime`**
    *   *Симптомы:* Сервер бомбардируется пустыми HTTP POST-запросами `{ events: [] }` каждые несколько секунд, даже когда пользователь отошел от компьютера.
    *   *Физика процесса:* По таймеру `bufferTime` обязан испустить накопленный массив. Если событий не было, он испускает пустой массив `[]`.
    *   *Решение:* Всегда добавляйте `filter(batch => batch.length > 0)` сразу после `bufferTime`.

*   **Ошибка 2: Утечки памяти из-за бесконечных незакрытых окон в `windowTime`**
    *   *Симптомы:* Медленный рост потребления памяти при использовании вложенных подписок внутри `windowTime`.
    *   *Физика процесса:* Каждое созданное окно — это активный Subject в памяти. Если внутренние потоки не завершаются оператором высшего порядка (`switchMap` / `mergeMap`), они продолжают удерживать ресурсы.
    *   *Решение:* Всегда сжимайте окна через `switchMap`, `concatAll` или операторы агрегации (`count`, `toArray`).

*   **Ошибка 3: Ожидание первого клика при скользящем `bufferCount(N, 1)`**
    *   *Симптомы:* Логика мульти-клика срабатывает с задержкой в один лишний клик при старте приложения.
    *   *Физика процесса:* Первое испускание массива из `bufferCount(3, 1)` произойдет строго тогда, когда накопится ровно 3 элемента.
    *   *Решение:* Это нормальное поведение оператора: для анализа тройного клика физически необходимо дождаться трех событий.
