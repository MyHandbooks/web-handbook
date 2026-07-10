---
tags: [angular, сигналы, архитектура]
related: ["[[Изменяемое реактивное состояние (signal).md]]", "[[Декларативные вычисления (computed).md]]", "[[Побочные эффекты (effect, untracked).md]]"]
status: "completed"
---

# Динамический сброс состояния (linkedSignal)

## БЫСТРЫЙ СТАРТ

*   **Реактивный примитив `linkedSignal`** — это изменяемый (writable) сигнал, значение которого жестко связано с изменениями одного или нескольких сигналов-источников. При изменении источника `linkedSignal` автоматически сбрасывает свое значение к новому дефолтному состоянию, но при этом разрешает прямую запись через методы `.set()` и `.update()`.
*   **Искоренение антипаттерна:** Он призван полностью заменить старый, хрупкий подход синхронизации зависимого состояния через побочные эффекты `effect()` или хук `ngOnChanges`, который приводил к двойным циклам детекции изменений и потенциальным бесконечным циклам в рантайме.
*   **Правила использования:**
    *   **Используйте:** Когда у вас есть изменяемое состояние, которое должно автоматически сбрасываться к начальному значению при смене контекста. Например, счетчик количества выбранного товара должен сбрасываться в `1` при смене активного продукта; выбранная опция доставки должна сбрасываться на первую доступную при смене региона.
    *   **Не используйте:** Если зависимое значение должно быть строго закрыто для записи извне (в этом случае используйте `computed`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Краткая форма linkedSignal (Автосброс счетчика при смене товара)
*   **Назначение:** Реализация классического сценария интернет-магазина, где количество заказываемого товара сбрасывается в `1` при переключении пользователем активного продукта, но остается свободно изменяемым при нажатии на кнопки «+» и «-».

#### 1. Файл логики: `product-order.ts`
```typescript
import { Component, signal, linkedSignal, ChangeDetectionStrategy } from '@angular/core';

export interface CatalogProduct {
  id: string;
  name: string;
}

@Component({
  selector: 'app-product-order',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [],
  templateUrl: './product-order.html',
  styleUrl: './product-order.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductOrder { // Имя класса очищено от суффикса Component
  // Сигнал, хранящий текущий выбранный продукт
  public readonly activeProduct = signal<CatalogProduct>({
    id: 'prod-1',
    name: 'Наушники ANC Wireless'
  });

  // Краткая форма linkedSignal. Сигнал quantity связан с изменениями activeProduct().
  // Как только activeProduct() меняет значение, quantity автоматически сбрасывается в 1.
  // При этом мы можем свободно вызывать на нем методы .set() и .update() как на обычном signal().
  public readonly quantity = linkedSignal<number>(() => {
    // Явно считываем зависимость. Angular регистрирует её автоматически.
    const product = this.activeProduct();
    console.log(`[linkedSignal] Товар изменен на ${product.id}. Сбрасываем количество в 1.`);
    return 1; // Возвращаем дефолтное стартовое значение для нового контекста
  });

  public increment(): void {
    this.quantity.update((q) => q + 1);
  }

  public decrement(): void {
    this.quantity.update((q) => Math.max(1, q - 1));
  }

  /**
   * Симулирует переключение активного товара пользователем
   */
  public switchProduct(): void {
    this.activeProduct.set({
      id: 'prod-2',
      name: 'Механическая клавиатура RGB'
    });
  }
}
```

#### 2. Файл разметки: `product-order.html`
```html
<div class="order-card">
  <h3>Выбранный товар: {{ activeProduct().name }}</h3>
  
  <div class="counter">
    <button (click)="decrement()">-</button>
    <span>Количество: {{ quantity() }}</span>
    <button (click)="increment()">+</button>
  </div>

  <button (click)="switchProduct()" class="action-btn">Сменить товар</button>
</div>
```

#### 3. Файл стилей: `product-order.css`
```css
.order-card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.counter {
  margin: 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.action-btn {
  padding: 6px 12px;
  cursor: pointer;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
}
```

---

### Шаблон 2: Полная форма linkedSignal с явным разделением источника и вычисления
*   **Назначение:** Использование продвинутой сигнатуры с доступом к предыдущему значению сигнала (`previous`). Позволяет делать "умные" сбросы — например, предотвращать сброс состояния формы, если ID нового товара остался прежним, а изменились лишь его второстепенные характеристики.

#### 1. Файл логики: `profile-editor.ts`
```typescript
import { Component, signal, linkedSignal, ChangeDetectionStrategy } from '@angular/core';

export interface UserProfilePayload {
  userId: string;
  userName: string;
  defaultDraft: string;
}

@Component({
  selector: 'app-profile-editor',
  imports: [],
  templateUrl: './profile-editor.html',
  styleUrl: './profile-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileEditor {
  // Активный профиль пользователя
  public readonly activeProfile = signal<UserProfilePayload>({
    userId: 'usr-1',
    userName: 'Алексей',
    defaultDraft: 'Привет, Алексей!'
  });

  // Полная форма linkedSignal. 
  // Разделяем источник отслеживания (source) и саму формулу вычисления (computation).
  public readonly commentDraft = linkedSignal<UserProfilePayload, string>({
    // Указываем, за какими именно изменениями мы следим
    source: () => this.activeProfile(),
    
    // Функция вычисления имеет доступ к текущему источнику и к объекту previous,
    // содержащему предыдущее значение источника и предыдущее значение самого linkedSignal.
    computation: (currentProfile, previous) => {
      // Умный сброс: если ID пользователя не изменился (например, обновилось только его имя),
      // мы возвращаем текущее набранное пользователем значение черновика, предотвращая его сброс!
      if (previous && previous.source.userId === currentProfile.userId) {
        console.log('[linkedSignal] ID пользователя тот же. Сохраняем набранный текст черновика.');
        return previous.value; // Возвращаем текущее состояние linkedSignal
      }

      console.log('[linkedSignal] ID пользователя изменился! Сбрасываем черновик к дефолту.');
      return currentProfile.defaultDraft; // Возвращаем дефолтное значение для нового пользователя
    }
  });

  public updateDraft(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    // Напрямую перезаписываем значение linkedSignal
    this.commentDraft.set(textarea.value);
  }

  public loadNextProfile(): void {
    this.activeProfile.set({
      userId: 'usr-2',
      userName: 'Мария',
      defaultDraft: 'Здравствуйте, Мария!'
    });
  }

  public updateProfileName(): void {
    // Меняем только имя пользователя, сохраняя его userId неизменным
    this.activeProfile.update((prev) => ({
      ...prev,
      userName: `${prev.userName} (Ред.)`
    }));
  }
}
```

#### 2. Файл разметки: `profile-editor.html`
```html
<div class="editor">
  <h4>Редактирование профиля: {{ activeProfile().userName }}</h4>
  
  <textarea 
    [value]="commentDraft()" 
    (input)="updateDraft($event)"
    rows="3"
    class="theme-input"
  ></textarea>

  <div class="actions">
    <button (click)="loadNextProfile()">Загрузить другой профиль</button>
    <button (click)="updateProfileName()">Обновить только имя текущего</button>
  </div>
</div>
```

#### 3. Файл стилей: `profile-editor.css`
```css
.editor {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.theme-input {
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
button {
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--border);
  background-color: var(--bg-primary);
  color: var(--text-normal);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурный крах эффектов синхронизации против linkedSignal
До появления `linkedSignal` в Angular 19 разработчики массово использовали побочные эффекты `effect()` для реализации сброса зависимого состояния:

```typescript
// УСТАРЕВШИЙ И ОПАСНЫЙ ПОДХОД (АНТИПАТТЕРН)
effect(() => {
  const product = this.activeProduct();
  // Вынужденно записываем значение в другой сигнал при изменении первого
  untracked(() => this.quantity.set(1)); 
});
```

Почему эта схема деструктивна для производительности приложения?
1.  **Двойные циклы рендеринга (Double Change Detection):** Изменение `activeProduct` помечает шаблон компонента как dirty. Angular запускает перерисовку. В процессе выполнения или после его завершения срабатывает асинхронный `effect()`, который перезаписывает `quantity`. Сигнал `quantity` снова помечает шаблон как dirty, заставляя Angular запускать повторный, дублирующий цикл Change Detection на следующем микрошаге. Экран мерцает, процессор делает двойную работу.
2.  **Угроза бесконечных циклов:** Если внутри эффекта случайно прочитать сигнал, в который вы записываете данные, без обертывания в `untracked()`, система уйдет в бесконечный цикл самовозбуждения обновлений, приводящий к аварийной блокировке браузера.

`linkedSignal` решает эту проблему **синхронно на уровне реактивного графа зависимостей**. Когда меняется источник, сброс значения зависимого `linkedSignal` происходит мгновенно в рамках единой транзакции обновления. К моменту запуска Change Detection система уже имеет консистентное новое состояние обоих сигналов. Экран перерисовывается строго один раз.

### 2. Продвинутая сигнатура и объект previous
Полная сигнатура метода `linkedSignal` имеет следующий TypeScript-интерфейс:
```typescript
function linkedSignal<S, D>(options: {
  source: () => S;
  computation: (source: S, previous?: { source: S; value: D }) => D;
}): WritableSignal<D>;
```
При первом (инициализирующем) запуске приложения аргумент `previous` равен `undefined`, так как истории вычислений еще не существует. В этот момент вы обязаны вернуть базовое дефолтное значение.

При всех последующих срабатываниях `previous` наполняется историческими данными:
*   `previous.source` — точное состояние источника до изменения.
*   `previous.value` — точное значение, которое находилось в самом `linkedSignal` прямо перед вызовом сброса (включая любые ручные правки пользователя через `.set()`).

Благодаря этому вы можете анализировать дельту изменений источника и принимать точечные архитектурные решения: стоит ли сбрасывать состояние, нужно ли инкрементировать значение относительно старого, или вернуть текущий ввод пользователя без изменений.

### 3. Пошаговый разбор умного сброса черновика
Проследим выполнение логики Шаблона 2 при обновлении имени пользователя внутри одного профиля:

1.  **Действие:** Вызывается `updateProfileName()`. Имя пользователя меняется с `'Алексей'` на `'Алексей (Ред.)'`. Идентификатор `userId` остается неизменным: `'usr-1'`.
2.  **Оповещение источника:** Сигнал `activeProfile` меняет значение и инкрементирует свою версию.
3.  **Анализ `linkedSignal`:** `commentDraft` видит изменение источника и запускает функцию `computation`:
    *   `currentProfile` равен `{ userId: 'usr-1', userName: 'Алексей (Ред.)', ... }`.
    *   `previous.source` равен `{ userId: 'usr-1', userName: 'Алексей', ... }`.
    *   `previous.value` равен текущему набранному пользователю тексту в textarea.
4.  **Сравнение:** Код проверяет условие: `previous.source.userId === currentProfile.userId`. Условие истинно (`'usr-1' === 'usr-1'`).
5.  **Блокировка сброса:** Функция возвращает `previous.value`. Текущий набранный пользователем черновик не затирается, текст в textarea остается нетронутым.
6.  **Результат:** Данные синхронизированы без затирания пользовательского ввода.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка падения на инициализации при неверной проверке previous**
    *   *Симптомы:* При первом открытии экрана приложение падает с ошибкой `Cannot read properties of undefined (reading 'source')` в консоли.
    *   *Физика процесса:* Разработчик пытается прочитать свойство `previous.source` без проверки на существование самого объекта `previous`: `computation: (curr, prev) => { if (prev.source.id === curr.id) { ... } }`. Поскольку на первом запуске `prev` равен `undefined`, обращение к нему вызывает классическую ошибку рантайма JavaScript.
    *   *Решение:* Всегда безопасно проверяйте существование `previous` перед чтением его свойств.

```typescript
// ОШИБКА: Упадет при инициализации, так как prev равен undefined
computation: (curr, prev) => prev.source.id === curr.id ? prev.value : curr.default

// ИСПРАВЛЕНИЕ: Безопасное использование опциональной цепочки
@Component({
  selector: 'app-safe-draft',
  templateUrl: './safe-draft.html',
  styleUrl: './safe-draft.css'
})
export class SafeDraft {
  public readonly profile = signal({ id: '1', defaultText: 'Привет' });
  
  public readonly draft = linkedSignal<any, string>({
    source: () => this.profile(),
    computation: (curr, prev) => prev?.source.id === curr.id ? prev.value : curr.defaultText
  });
}
```

*   **Ошибка 2: Попытка прямой записи в computed вместо использования linkedSignal**
    *   *Симптомы:* Ошибка компиляции `Property 'set' does not exist on type 'Signal<T>'` при попытке реализовать ручную перезапись значения.
    *   *Физика процесса:* Разработчик объявляет состояние через `computed()`, так как оно зависит от другого сигнала, но затем пытается реализовать пользовательский ввод: `computedValue.set(newValue)`. Вычисляемые сигналы строго закрыты для ручной записи.
    *   *Решение:* Замените объявление `computed()` на `linkedSignal()`.

```typescript
// ОШИБКА: computed доступен только для чтения
draft = computed(() => this.profile().defaultText);
update(val: string) { this.draft.set(val); }

// ИСПРАВЛЕНИЕ: linkedSignal сохраняет реактивную связь, но открыт для записи
@Component({
  selector: 'app-writable-draft',
  templateUrl: './writable-draft.html',
  styleUrl: './writable-draft.css'
})
export class WritableDraft {
  public readonly profile = signal({ id: '1', defaultText: 'Привет' });
  public readonly draft = linkedSignal(() => this.profile().defaultText);

  public update(val: string): void {
    this.draft.set(val); // Успешно перезаписываем локальный сигнал
  }
}
```

*   **Ошибка 3: Создание хрупких длинных цепочек сброса состояния (Reset Cascade)**
    *   *Симптомы:* Труднонаходимые баги, когда изменение одного базового сигнала приводит к хаотичному каскадному сбросу десятков полей на форме, которые должны были остаться нетронутыми.
    *   *Физика процесса:* Разработчик связывает `linkedSignal A` с источником `B`, а `linkedSignal C` связывает с источником `A`. Создается длинная цепочка неявных транзитивных зависимостей. При малейшем обновлении `B` запускается неконтролируемая лавина сбросов по всему приложению.
    *   *Решение:* Проектируйте связи плоско. Связывайте зависимые сигналы напрямую с одним корневым «источником правды» (например, сигналом ID активной сессии или выбранного товара) и избегайте многоуровневого вложения связанных сигналов друг в друга.