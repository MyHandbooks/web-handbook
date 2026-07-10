---
tags: [angular, компоненты-и-шаблоны, архитектура]
related: ["[[Базовая декларативная структура Standalone-компонента.md]]", "[[Условные блоки в шаблоне (@if, @else).md]]"]
status: "completed"
---

# Переключатель состояний в шаблоне (@switch)

## БЫСТРЫЙ СТАРТ

*   **@switch / @case / @default** — это встроенный декларативный механизм ветвления в Angular (Control Flow), предназначенный для выбора одного из множества взаимоисключающих вариантов разметки на основе точного совпадения значений. Он полностью заменяет устаревшую директиву `*ngSwitch`.
*   **Оптимизация на рантайме:** Компилятор преобразует конструкцию `@switch` в легковесные JS-инструкции Ivy. Оценка выражения переключателя происходит ровно один раз за цикл проверки изменений, после чего рантайм выполняет быстрое сопоставление, исключая последовательный перебор неактивных веток (в отличие от цепочек `@if` / `@else if`).
*   **Правила использования:**
    *   **Используйте:** При наличии строго заданного, ограниченного набора взаимоисключающих состояний — например, переключений вкладок (tabs), шагов пошагового мастера (wizard steps), типов разметки карточек или состояний асинхронного процесса (`idle`, `loading`, `success`, `error`).
    *   **Не используйте:** Для сложных логических диапазонов (например, `value > 100` или `value === null || isPending`). В таких сценариях используйте блок `@if`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Управление жизненным циклом сетевого запроса на Union-типе
*   **Назначение:** Отрисовка различных состояний интерфейса (ожидание, загрузка, успех, ошибка) в зависимости от значения строкового литерала состояния.

```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

// Объявление строгого Union-типа для машины состояний процесса
export type NetworkRequestState = 'idle' | 'loading' | 'success' | 'error';

@Component({
  selector: 'app-switch-status',
  standalone: true,
  imports: [], // Встроенный Control Flow не требует внешних импортов директив в standalone-компоненте
  template: `
    <div class="status-card">
      <!-- 
        Переключатель считывает текущий реактивный сигнал состояния.
        Вычисление значения происходит единожды за проход проверки изменений.
      -->
      @switch (currentRequestState()) {
        @case ('idle') {
          <!-- Отображается, когда процесс еще не был запущен -->
          <div class="state-box idle">
            <p>Система готова к загрузке данных.</p>
            <button (click)="startProcessing()">Начать импорт</button>
          </div>
        }
        @case ('loading') {
          <!-- Отображается во время асинхронного выполнения -->
          <div class="state-box loading">
            <div class="spinner"></div>
            <p>Выполняется сетевое взаимодействие...</p>
          </div>
        }
        @case ('success') {
          <!-- Отображается при успешном завершении -->
          <div class="state-box success">
            <p>Данные успешно импортированы в базу.</p>
            <button (click)="resetState()">Вернуться в начало</button>
          </div>
        }
        @case ('error') {
          <!-- Отображается при сбое операции -->
          <div class="state-box error">
            <p>Произошел критический сбой передачи данных.</p>
            <button (click)="startProcessing()">Повторить попытку</button>
          </div>
        }
        @default {
          <!-- Резервный блок на случай непредвиденных рантайм-состояний -->
          <div class="state-box default">
            <p>Неизвестный статус системы.</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .status-card { padding: 20px; border: 1px solid var(--border); border-radius: 8px; }
    .state-box { padding: 15px; border-radius: 6px; text-align: center; }
    .idle { border-left: 4px solid var(--text-muted); }
    .loading { border-left: 4px solid var(--accent); }
    .success { border-left: 4px solid var(--success-text); background-color: var(--success-bg); }
    .error { border-left: 4px solid var(--error-text); background-color: var(--error-bg); }
    .spinner { border: 3px solid var(--border); border-top: 3px solid var(--accent); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SwitchStatusComponent {
  // Реактивный сигнал, контролирующий текущее состояние интерфейса
  readonly currentRequestState = signal<NetworkRequestState>('idle');

  startProcessing(): void {
    this.currentRequestState.set('loading');
    
    // Эмуляция завершения процесса через таймер
    setTimeout(() => {
      // Вероятностный исход для демонстрации разных веток
      const isSuccessful = Math.random() > 0.3;
      this.currentRequestState.set(isSuccessful ? 'success' : 'error');
    }, 2000);
  }

  resetState(): void {
    this.currentRequestState.set('idle');
  }
}
```

---

### Шаблон 2: Полиморфный рендеринг карточек контента (Дискриминантные объединения)
*   **Назначение:** Отрисовка различных типов UI-карточек (текстовая, изображение, видео) на основе дискриминантного свойства `type` с автоматическим сужением типов TypeScript внутри веток шаблона.

```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

// Семейство интерфейсов для полиморфной структуры данных
export interface TextCard {
  readonly type: 'text';
  readonly header: string;
  readonly contentText: string;
}

export interface ImageCard {
  readonly type: 'image';
  readonly header: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
}

export interface VideoCard {
  readonly type: 'video';
  readonly header: string;
  readonly videoUrl: string;
  readonly duration: number;
}

// Дискриминантное объединение (Tagged Union) типов карточек
export type ContentCardPayload = TextCard | ImageCard | VideoCard;

@Component({
  selector: 'app-switch-polymorphic',
  standalone: true,
  imports: [],
  template: `
    <div class="workspace">
      <!-- 
        Ветвление рендеринга на основе дискриминантного поля 'type'.
        Для каждого блока @case компилятор TypeScript автоматически сузит тип 
        объекта 'payload', делая доступными только специфичные свойства.
      -->
      @switch (payload().type) {
        @case ('text') {
          <!-- TS знает, что здесь payload - это TextCard. Доступно свойство contentText -->
          <div class="render-box text">
            <h4>{{ payload().header }}</h4>
            <p class="body-text">{{ getTextPayload().contentText }}</p>
          </div>
        }
        @case ('image') {
          <!-- TS знает, что здесь payload - это ImageCard. Доступны свойства imageUrl и imageAlt -->
          <div class="render-box image">
            <h4>{{ payload().header }}</h4>
            <img [src]="getImagePayload().imageUrl" [alt]="getImagePayload().imageAlt" class="responsive-img">
          </div>
        }
        @case ('video') {
          <!-- TS знает, что здесь payload - это VideoCard. Доступны свойства videoUrl и duration -->
          <div class="render-box video">
            <h4>{{ payload().header }}</h4>
            <div class="video-preview">
              <span class="play-icon">▶</span>
              <span>Продолжительность: {{ getVideoPayload().duration }} сек.</span>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .workspace { max-width: 400px; }
    .render-box { border: 1px solid var(--border); border-radius: 8px; padding: 16px; background-color: var(--bg-secondary); }
    .responsive-img { width: 100%; height: auto; border-radius: 4px; margin-top: 8px; }
    .body-text { color: var(--text-muted); font-size: 0.9rem; margin-top: 8px; }
    .video-preview { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 0.85rem; color: var(--accent); }
    .play-icon { font-size: 1.2rem; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SwitchPolymorphicComponent {
  // Начальная инициализация сигнального хранилища текстовым типом данных
  readonly payload = signal<ContentCardPayload>({
    type: 'text',
    header: 'Системное уведомление',
    contentText: 'Конфигурация завершена без ошибок выполнения.'
  });

  // Вспомогательные хелперы-геттеры для явного каста типов компилятору TypeScript в шаблоне
  getTextPayload(): TextCard {
    return this.payload() as TextCard;
  }

  getImagePayload(): ImageCard {
    return this.payload() as ImageCard;
  }

  getVideoPayload(): VideoCard {
    return this.payload() as VideoCard;
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Подкапотная физика компиляции: Эволюция от `*ngSwitch`
В классической версии Angular с использованием директивы `*ngSwitch` процесс рендеринга сопровождался накладными расходами:
1.  **Создание иерархии инжекторов:** Каждая директива `*ngSwitchCase` требовала инжекции класса `TemplateRef` и `ViewContainerRef` через ElementInjector.
2.  **Зависимость от DI:** Директива `ngSwitch` связывалась с дочерними `ngSwitchCase` через двунаправленный слой DI (декоратор `@Host` / `@Optional`), что нагружало внутренние циклы разрешения зависимостей.
3.  **Перевычисление цепочек:** Изменение исходной переменной инициировало обход всех зарегистрированных `NgSwitchCase` дочерних элементов и последовательную проверку их условий.

Новый `@switch` в синтаксисе Control Flow лишен этих недостатков:
*   Компилятор Ivy (`ngtsc`) парсит `@switch` как единый монолитный блок инструкций.
*   На уровне скомпилированной функции шаблона выражение вычисляется ровно один раз. Полученный результат сопоставляется со значениями констант внутри блоков `@case`.
*   Рантайм выполняет точечную активацию или уничтожение нужной ветки embedded view без создания вспомогательных инжекторов и классов директив, что сравнимо по скорости работы со стандартным оператором `switch` в нативном JavaScript.

### 2. Статический анализ и сужение типов в блоках `@case`
TypeScript нативно умеет производить сужение типов (Type Narrowing) на основе константных условий. В синтаксисе Angular Control Flow эта возможность полностью перенесена в HTML-шаблон.

Когда в конструкции `@switch (payload.type)` значение совпадает с `@case ('image')`, компилятор Angular в рамках этого блока кода ограничивает тип `payload` до интерфейса `ImageCard`. Это защищает разработчика от случайных ошибок обращения к несуществующим полям (например, попытки прочитать `duration` внутри блока картинки), которые привели бы к ошибкам компиляции или падениям приложения во время работы.

### 3. Детальный пошаговый разбор выполнения шаблона при смене статуса
При переходе `currentRequestState` из `'loading'` в `'success'`:
1.  **Обновление реактивного узла:** Метод `.set('success')` меняет значение сигнала. Angular помечает компонент для перерисовки.
2.  **Вычисление значения переключателя:** Рантайм считывает состояние сигнала и получает строку `'success'`.
3.  **Деструктуризация предыдущей ветки:** Предыдущий блок `@case ('loading')` деактивируется. Его DOM-элементы физически удаляются из разметки, а связанные ресурсы и обработчики уничтожаются.
4.  **Активация целевого блока:** Рантайм выполняет прямой переход к блоку `@case ('success')`, инициализирует его DOM-структуру и выполняет монтирование в дерево рендеринга.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Пропуск блока `@default` при расширяемых Union-типах**
    *   *Симптомы:* После добавления нового статуса на бэкенде интерфейс приложения отображает пустой белый экран (или пустую область) без каких-либо ошибок в консоли разработчика.
    *   *Физика процесса:* Если разработчик расширяет тип `type NewState = 'A' | 'B' | 'C'` до `... | 'D'`, но забывает добавить соответствующий блок `@case ('D')` в разметку, то при получении `'D'` Angular последовательно пропустит все условия. При отсутствии блока `@default` в DOM не будет смонтировано ничего, что нарушает целостность UX.
    *   *Решение:* Всегда проектировать блоки `@default` как защитные заглушки или уведомления о неизвестном состоянии интерфейса.

```typescript
// ОШИБКА: Отсутствие дефолтной ветки. При получении нового нерасписанного статуса разметка скроется без предупреждения
@switch (state()) {
  @case ('active') { <active-view /> }
  @case ('disabled') { <disabled-view /> }
}

// ИСПРАВЛЕНИЕ: Обязательное добавление резервного блока
@switch (state()) {
  @case ('active') { <active-view /> }
  @case ('disabled') { <disabled-view /> }
  @default {
    <div class="warning-alert">
      <span>Обнаружен неподдерживаемый статус системы. Обратитесь в техподдержку.</span>
    </div>
  }
}
```

*   **Ошибка 2: Попытка выполнения сложных логических сравнений внутри `@case`**
    *   *Симптомы:* Ошибки компиляции шаблона: `Parser Error: Unexpected token...` или непредсказуемое поведение ветвления.
    *   *Физика процесса:* В отличие от классического `switch` в JS, синтаксис `@case` в Angular предназначен строго для сопоставления константных эквивалентных значений (`===`). Попытка написать выражение сравнения типа `@case (value > 10)` не сработает, так как Angular будет сравнивать результат выражения переключателя с булевым результатом `true` / `false`, вычисленным внутри `case`.
    *   *Решение:* Использовать цепочки условий `@if` / `@else if` для вычисления диапазонов.

```typescript
// ОШИБКА: Попытка использовать операторы сравнения внутри case
@switch (userScore()) {
  @case (userScore() >= 90) { <span>Отлично</span> } // Сбой логики и компиляции
}

// ИСПРАВЛЕНИЕ: Использование @if для диапазонов и сравнений
@if (userScore() >= 90) {
  <span>Отлично</span>
} @else if (userScore() >= 50) {
  <span>Хорошо</span>
} @else {
  <span>Неудовлетворительно</span>
}
```

*   **Ошибка 3: Вычисление тяжелых динамических выражений в заголовке `@switch`**
    *   *Симптомы:* Просадки производительности (низкий FPS), постоянное пересоздание и мерцание UI-элементов при любых действиях пользователя.
    *   *Физика процесса:* Если в качестве аргумента переключателя передать функцию, которая при каждом вызове генерирует новый объект (например, `@switch (calculateCurrentConfig())`), Angular на каждом шаге Change Detection будет получать новую ссылку на объект. Это заставит рантайм считать, что состояние полностью изменилось, инициируя непрерывный цикл удаления и пересоздания DOM-элементов.
    *   *Решение:* Передавать в `@switch` исключительно примитивные типы (строки, числа, булевы значения) из реактивных сигналов или мемоизированных `computed`-хранилищ.

```typescript
// ОШИБКА: Функция генерирует новый объект при каждом проходе, вызывая бесконечный ререндеринг DOM
@switch (getComplexDynamicObject()) { ... }

// ИСПРАВЛЕНИЕ: Передача примитивного ключа-идентификатора состояния
@switch (activeStateId()) { ... }
```