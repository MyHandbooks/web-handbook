---
tags: [angular, компоненты-и-шаблоны, связь-компонентов]
related: ["Входные свойства на Сигналах (input).md", "Поиск дочерних элементов (viewChild).md"]
status: "completed"
---

# Генерация событий через Output API

## БЫСТРЫЙ СТАРТ

*   **Output API (функция `output()`)** — это современная функциональная замена классического декоратора `@Output()` и класса `EventEmitter`, представленная как стабильный стандарт. Она служит для организации строго типизированных каналов обратной связи от дочернего компонента к родительскому.
*   **Легковесная архитектура:** Прежний класс `EventEmitter` наследовался от RxJS `Subject`, что утяжеляло сборку и вносило скрытые накладные расходы. Новая функция `output()` возвращает объект `OutputRef<T>`, работающий на чистом и быстром внутреннем паттерне событий, не зависящем от RxJS.
*   **Правила использования:**
    *   **Используйте:** Для проектирования любых событий во всех новых Standalone-компонентах (клики по кнопкам управления, завершение отправки форм, передача данных наверх) для достижения лучшей производительности и строгой типизации.
    *   **Не используйте:** Только в устаревших монолитных компонентах до начала плановой миграции, либо при интеграции с внешними библиотеками старого образца, требующими передачи исключительно объектов `EventEmitter`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Базовый функциональный Output со строгой типизацией данных
*   **Назначение:** Передача структурированных сведений о выполненном действии `TargetEventPayload` из дочерней карточки в родительский контекст.

```typescript
import { Component, ChangeDetectionStrategy, output } from '@angular/core';

// Строгий интерфейс для отправляемого пакета данных
export interface TargetEventPayload {
  readonly actionId: string;
  readonly timestamp: Date;
}

@Component({
  selector: 'app-child-event-card',
  standalone: true,
  imports: [],
  template: `
    <div class="event-card">
      <p>Панель управления дочернего элемента</p>
      <!-- Запуск методов генерации событий при кликах -->
      <button (click)="emitActionEvent('CONFIRM_CLICK')">Подтвердить действие</button>
      <button (click)="emitActionEvent('CANCEL_CLICK')">Отменить</button>
    </div>
  `,
  styles: [`
    .event-card { border: 1px solid var(--border); padding: 15px; border-radius: 8px; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChildEventCardComponent {
  // Объявление канала событий с помощью функции output() вне конструктора.
  // Автоматически генерируется строго типизированный экземпляр OutputRef<TargetEventPayload>.
  readonly actionTriggered = output<TargetEventPayload>();

  // Формирование пакета полезной нагрузки и отправка события
  emitActionEvent(actionType: string): void {
    const payload: TargetEventPayload = {
      actionId: actionType,
      timestamp: new Date()
    };

    // Вызов метода emit() осуществляет немедленную передачу события родителю
    this.actionTriggered.emit(payload);
  }
}
```

---

### Шаблон 2: Прямая трансляция RxJS-потоков в Output (`outputFromObservable`)
*   **Назначение:** Автоматический экспорт данных из реактивного RxJS-потока (например, фонового интервального таймера) во внешний родительский компонент.

```typescript
import { Component, ChangeDetectionStrategy, inject, DestroyRef } from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import { interval, map, takeUntil, Observable } from 'rxjs';

@Component({
  selector: 'app-child-stream-sender',
  standalone: true,
  imports: [],
  template: `
    <div class="stream-panel">
      <p>Дочерний таймер активен в фоновом режиме...</p>
    </div>
  `,
  styles: [`
    .stream-panel { padding: 12px; border-left: 4px solid var(--accent); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChildStreamSenderComponent {
  // Внедрение ссылки на системный контекст уничтожения компонента
  private readonly destroyRef = inject(DestroyRef);

  // Описание реактивного RxJS-потока с генерацией тиков каждую секунду
  private readonly timer$ = interval(1000).pipe(
    map(tick => `Событие тик №${tick}`),
    // Автоматически отписываемся и завершаем поток при уничтожении компонента
    takeUntil(new Observable(subscriber => {
      this.destroyRef.onDestroy(() => {
        subscriber.next();
        subscriber.complete();
      });
    }))
  );

  // Декларативная привязка RxJS-потока к Output API.
  // Angular сам выполнит подписку при инициализации и закроет ее при уничтожении.
  readonly tickEmitted = outputFromObservable<string>(this.timer$);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная разница: `OutputRef` против `EventEmitter`
В классическом Angular синтаксис `@Output() myEvent = new EventEmitter()` накладывал серьезные ограничения:
1.  **Зависимость от RxJS:** Класс `EventEmitter` напрямую расширяет `Subject` из библиотеки RxJS. Это заставляло загружать весь механизм RxJS даже в простейших компонентах-пустышках, которым требовалось лишь однократно передать флаг клика по кнопке.
2.  **Накладные расходы Zone.js:** Каждая генерация события через `EventEmitter` заставляла Zone.js перехватывать микротаски и инициировать глобальный цикл Change Detection по всему приложению, что создавало проблемы с производительностью в высокочастотных сценариях.

Новое Output API возвращает объект `OutputRef<T>`. Его физика работы в Ivy строится на базе чистого, легковесного паттерна «Слушатель» (Listener):
*   `OutputRef` не содержит RxJS-операторов и тяжелых прототипов.
*   Подписка на события в родительском HTML-шаблоне транслируется в прямой вызов функции обратного вызова (callback), минуя накладные расходы на создание цепочек обсерваблов.
*   Превосходная интеграция с Zoneless-режимом: вызовы событий через `OutputRef` точечно помечают нужные компоненты графа реактивности без тотального обхода дерева DOM.

### 2. Совместимость с RxJS: `outputFromObservable` и `outputToObservable`
Для обеспечения плавной миграции без переписывания реактивных цепочек в пакете `@angular/core/rxjs-interop` были представлены две вспомогательные функции-мосты:

1.  **`outputFromObservable(source$)`**: Функция-компилятор, преобразующая обсервабл в `OutputRef`. Она автоматически подписывается на входящий стрим. Новые значения (`next`) пробрасываются в родительский компонент, а события завершения потока (`complete`) корректно высвобождают ресурсы.
2.  **`outputToObservable(outputRef)`**: Позволяет родительскому компоненту или сервису превратить стандартный `OutputRef` обратно в RxJS `Observable`. Это удобно, если родитель хочет применить к событиям ребенка операторы фильтрации или подавления дребезга (например, `.pipe(debounceTime(300))`).

### 3. Пошаговый разбор выполнения передачи события
Когда пользователь нажимает кнопку в `ChildEventCardComponent`:
1.  **Вызов обработчика клика:** Срабатывает нативный метод `emitActionEvent('CONFIRM_CLICK')`.
2.  **Формирование пакета данных:** Создается немутабельный объект `TargetEventPayload` со штампом времени.
3.  **Вызов `output.emit()`:** Метод `emit()` обращается к внутреннему реестру слушателей `OutputRef`.
4.  **Разрешение связи в родительском шаблоне:** Родительский обработчик `<app-child-event-card (actionTriggered)="onParentHandle($event)" />` получает управление. Значение `$event` содержит переданный payload. Весь процесс выполняется за один синхронный проход стека вызовов JS.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Попытка мутации (изменения) объекта события в родительском компоненте**
    *   *Симптомы:* Непредсказуемое поведение UI; дочерний компонент отображает некорректные внутренние данные, хотя в него ничего не передавали напрямую; баги отслеживания изменений.
    *   *Физика процесса:* Объекты в JavaScript передаются по ссылке. Если дочерний компонент генерирует объект события и отправляет его через `emit()`, а родительский компонент перехватывает его и выполняет мутацию свойств (`event.actionId = 'MUTATED'`), эти изменения тихо затронут внутреннее состояние дочернего компонента в обход механизмов Change Detection Angular.
    *   *Решение:* Передавать через Output исключительно иммутабельные (замороженные) структуры данных. В родителе при необходимости модификации создавать новую копию объекта через spread-оператор.

```typescript
// ОШИБКА: Мутация переданного по ссылке объекта события в родителе
onParentHandle(event: TargetEventPayload): void {
  // Изменение свойства напрямую нарушает однонаправленный поток данных!
  (event as any).actionId = 'NEW_VALUE'; 
}

// ИСПРАВЛЕНИЕ: Создание глубокой или поверхностной копии объекта
onParentHandleCorrectly(event: TargetEventPayload): void {
  const updatedEvent = {
    ...event,
    actionId: 'NEW_VALUE'
  };
  // Дальнейшая работа с полностью изолированным объектом updatedEvent
}
```

*   **Ошибка 2: Пропуск обработки ошибок внутри источника в `outputFromObservable`**
    *   *Симптомы:* События прекращают приходить родителю после первой же сетевой ошибки; Output зависает в «мертвом» состоянии.
    *   *Физика процесса:* Если RxJS-источник, переданный в `outputFromObservable`, выбрасывает ошибку (`error` notification), то согласно спецификации RxJS поток полностью прекращает свое существование. Angular не обрабатывает внутренние ошибки обсервабла автоматически. Как только поток падает, Output больше никогда не сможет генерировать новые события.
    *   *Решение:* Всегда изолировать и обрабатывать ошибки внутри конвейера `pipe` обсервабла-источника с помощью оператора `catchError`.

```typescript
// ОШИБКА: Ошибка в потоке убьет Output окончательно
private readonly unsafeStream$ = this.http.get('/api').pipe();
readonly dataReceived = outputFromObservable(this.unsafeStream$);

// ИСПРАВЛЕНИЕ: Изоляция ошибки и возвращение стабильного потока
import { catchError, EMPTY } from 'rxjs';

private readonly safeStream$ = this.http.get('/api').pipe(
  catchError(error => {
    console.error('Сбой получения данных в Output:', error);
    // EMPTY завершает текущий HTTP-запрос, но сохраняет конвейер работоспособным
    return EMPTY; 
  })
);
readonly dataReceivedSafe = outputFromObservable(this.safeStream$);
```

*   **Ошибка 3: Передача сырых нативных браузерных событий (`PointerEvent`) вместо абстрактных пакетов**
    *   *Симптомы:* Тесты родительского компонента ломаются при любых изменениях верстки дочернего элемента; сильная связанность компонентов; сложность сопровождения.
    *   *Физика процесса:* Передача нативного события `PointerEvent` напрямую наверх заставляет родительский компонент знать о внутренней DOM-структуре ребенка (например, читать `event.target.value`). Если верстка ребенка изменится (например, инпут заменится на селект), родительский код упадет с ошибкой времени выполнения.
    *   *Решение:* Всегда инкапсулировать нативные события внутри дочернего компонента и отдавать наружу только логически чистые структуры (бизнес-модели или примитивы).

```typescript
// ОШИБКА: Проброс сырого PointerEvent наружу
// Шаблон: <button (click)="clickOutput.emit($event)">Отправить</button>
readonly clickOutput = output<PointerEvent>();

// ИСПРАВЛЕНИЕ: Передача очищенной абстрактной бизнес-информации
// Шаблон: <button (click)="handleCleanClick()">Отправить</button>
readonly clickOutputClean = output<string>();

handleCleanClick(): void {
  // Передаем родителю только то, что ему действительно нужно знать
  this.clickOutputClean.emit('SUBMIT_FORM_ACTION');
}
```