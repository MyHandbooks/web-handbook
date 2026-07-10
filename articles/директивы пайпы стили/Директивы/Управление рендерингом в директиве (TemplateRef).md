---
tags: [angular, директивы, рендеринг]
related: ["[[Безопасное управление DOM в диретиве (Renderer2).md]]", "[[Кастомный чистый пайп (pure pipe).md]]"]
status: "completed"
---

# Управление рендерингом в директиве (TemplateRef)

## БЫСТРЫЙ СТАРТ

*   **Структурная директива** — это директива, которая управляет разметкой, изменяя структуру DOM-дерева (добавляя, удаляя или перемещая элементы). В HTML-шаблоне такие директивы обозначаются префиксом звездочки `*` (например, `*appRoleAccess`).
*   **Служба `TemplateRef`** представляет собой встроенную абстракцию над тегом `<ng-template>`. Она хранит объявление фрагмента верстки, готового к компиляции и встраиванию в DOM.
*   **Служба `ViewContainerRef`** — это контейнер, привязанный к хост-элементу директивы, в который можно динамически рендерить одно или несколько представлений (инстансов `TemplateRef`).
*   **Используйте:** Для сквозной логики отрисовки интерфейса на основе прав доступа (ACL), Feature Flags, отложенной ленивой отрисовки тяжелых блоков, списков с динамическим контекстом или условного рендеринга на Сигналах.
*   **Не используйте:** Для простых манипуляций стилями или классами хост-элемента (для этого подходят атрибутные директивы и `Renderer2`). Для простых ветвлений, не требующих переиспользования логики, отдавайте предпочтение новому управляющему синтаксису `@if` и `@else`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Структурная директива контроля доступа по ролям (RoleAccess)
*   **Назначение:** Директива скрывает или отображает защищенные элементы интерфейса на основе текущей роли авторизованного пользователя, отслеживаемой реактивным Сигналом из глобального сервиса.

#### 1. Файл общего состояния авторизации: `auth-state.ts`
```typescript
import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root' // Создаем глобальный синглтон для хранения роли
})
export class AuthState {
  // Сигнал, содержащий текущую роль пользователя в системе
  public readonly currentRole: WritableSignal<string> = signal<string>('guest');
}
```

#### 2. Файл директивы: `role-access.ts`
```typescript
import { Directive, inject, TemplateRef, ViewContainerRef, input, effect } from '@angular/core';
import { AuthState } from './auth-state';

// Контекст для передачи роли непосредственно внутрь шаблона (при необходимости)
interface RoleContext {
  $implicit: string; // Передается как дефолтное значение для let-переменной
}

@Directive({
  selector: '[appRoleAccess]' // Имя селектора для использования в виде *appRoleAccess
})
export class RoleAccess {
  // Внедряем шаблон, к которому применена структурная директива
  private readonly templateRef = inject(TemplateRef<RoleContext>);
  // Внедряем контейнер, куда этот шаблон будет встраиваться
  private readonly viewContainer = inject(ViewContainerRef);
  // Внедряем глобальное состояние авторизации
  private readonly authState = inject(AuthState);

  // Входной параметр-сигнал, принимающий требуемую для доступа роль
  public readonly appRoleAccess = input.required<string>();

  constructor() {
    // Реализуем реактивную логику через эффект для автоматического слежения за состоянием
    effect(() => {
      const requiredRole = this.appRoleAccess();
      const userRole = this.authState.currentRole();

      if (userRole === requiredRole) {
        // Проверяем, пусто ли в контейнере, чтобы избежать дублирования элементов
        if (this.viewContainer.length === 0) {
          // Создаем и монтируем представление в DOM с передачей контекста
          this.viewContainer.createEmbeddedView(this.templateRef, {
            $implicit: userRole
          });
        }
      } else {
        // Если роли не совпадают, полностью очищаем контейнер и удаляем ноды из DOM
        this.viewContainer.clear();
      }
    });
  }
}
```

#### 3. Файл логики демонстрационного компонента: `role-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AuthState } from './auth-state';
import { RoleAccess } from './role-access';

@Component({
  selector: 'app-role-demo',
  imports: [RoleAccess], // Импортируем директиву напрямую в Standalone-компонент
  templateUrl: './role-demo.html',
  styleUrl: './role-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleDemo {
  private readonly auth = inject(AuthState);

  // Метод для динамического переключения ролей кнопками демонстрации
  public changeUserRole(newRole: string): void {
    this.auth.currentRole.set(newRole);
  }
}
```

#### 4. Файл разметки демонстрационного компонента: `role-demo.html`
```html
<div class="demo-container">
  <div class="controls">
    <button (click)="changeUserRole('guest')">Войти как Гость</button>
    <button (click)="changeUserRole('admin')">Войти как Админ</button>
  </div>

  <!-- Применяем структурную директиву. Элемент отрендерится только для роли 'admin' -->
  <div *appRoleAccess="'admin'; let activeRole" class="admin-panel">
    <h3>Панель администратора</h3>
    <p>Доступ разрешен. Ваша текущая роль: <strong>{{ activeRole }}</strong></p>
  </div>
</div>
```

#### 5. Файл стилей демонстрационного компонента: `role-demo.css`
```css
.demo-container {
  padding: 20px;
}

.controls {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.admin-panel {
  padding: 16px;
  background-color: var(--success-bg);
  color: var(--success-text);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

---

### Шаблон 2: Директива ленивого отложенного рендеринга (LazyRender)
*   **Назначение:** Директива монтирует переданный блок разметки в DOM только по истечении заданного интервала времени, выполняя гарантированную очистку ресурсов для исключения утечек памяти.

#### 1. Файл директивы: `lazy-render.ts`
```typescript
import { Directive, inject, TemplateRef, ViewContainerRef, OnInit, input, DestroyRef } from '@angular/core';

@Directive({
  selector: '[appLazyRender]'
})
export class LazyRender implements OnInit {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  // Используем DestroyRef для очистки асинхронных таймеров вне хуков жизненного цикла
  private readonly destroyRef = inject(DestroyRef);

  // Входной параметр-сигнал для определения задержки рендеринга в миллисекундах
  public readonly appLazyRender = input<number>(1000);

  public ngOnInit(): void {
    // Инициализируем отложенное выполнение
    const timerId = setTimeout(() => {
      this.renderTemplate();
    }, this.appLazyRender());

    // Регистрируем колбэк очистки на случай уничтожения директивы до завершения таймаута
    this.destroyRef.onDestroy(() => {
      clearTimeout(timerId);
    });
  }

  private renderTemplate(): void {
    if (this.viewContainer.length === 0) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    }
  }
}
```

#### 2. Файл логики демонстрационного компонента: `lazy-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { LazyRender } from './lazy-render';

@Component({
  selector: 'app-lazy-demo',
  imports: [LazyRender],
  templateUrl: './lazy-demo.html',
  styleUrl: './lazy-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LazyDemo { }
```

#### 3. Файл разметки демонстрационного компонента: `lazy-demo.html`
```html
<div class="demo-container">
  <h2>Пример отложенного вывода элементов</h2>
  
  <!-- Разметка отрендерится в DOM ровно через 2.5 секунды после загрузки -->
  <div *appLazyRender="2500" class="delayed-box">
    <p>🎉 Этот блок появился с задержкой в 2.5 секунды!</p>
  </div>
</div>
```

#### 4. Файл стилей демонстрационного компонента: `lazy-demo.css`
```css
.demo-container {
  padding: 24px;
}

.delayed-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-normal);
}
```

---

### Шаблон 3: Двунаправленный контекстный контейнер состояния (DataWrapper)
*   **Назначение:** Структурная директива, которая принимает динамический объект данных, оборачивает его в типизированный контекст и рендерит шаблон, обновляя локальные переменные в реальном времени.

#### 1. Файл директивы: `data-wrapper.ts`
```typescript
import { Directive, inject, TemplateRef, ViewContainerRef, input, effect } from '@angular/core';

// Объявляем строгий обобщенный интерфейс контекста шаблона
interface WrapperContext<T> {
  $implicit: T; // Ключевое поле для доступа через синтаксис let-data
  timestamp: Date; // Вспомогательные данные контекста
}

@Directive({
  selector: '[appDataWrapper]'
})
export class DataWrapper<T> { // Работаем с универсальными типами через Generics
  // Передаем интерфейс контекста в TemplateRef для строгой типизации шаблона
  private readonly templateRef = inject(TemplateRef<WrapperContext<T>>);
  private readonly viewContainer = inject(ViewContainerRef);

  // Принимаем данные произвольного типа T
  public readonly appDataWrapper = input.required<T>();

  constructor() {
    effect(() => {
      const dataValue = this.appDataWrapper();

      // Сбрасываем старое представление
      this.viewContainer.clear();

      // Создаем новое представление, передавая обновленные данные в контекст шаблона
      this.viewContainer.createEmbeddedView(this.templateRef, {
        $implicit: dataValue,
        timestamp: new Date()
      });
    });
  }
}
```

#### 2. Файл логики демонстрационного компонента: `wrapper-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { DataWrapper } from './data-wrapper';

interface UserPayload {
  id: string;
  name: string;
  score: number;
}

@Component({
  selector: 'app-wrapper-demo',
  imports: [DataWrapper],
  templateUrl: './wrapper-demo.html',
  styleUrl: './wrapper-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WrapperDemo {
  // Сигнал, содержащий динамический объект данных
  public readonly activeUser = signal<UserPayload>({
    id: 'usr-92',
    name: 'Константин',
    score: 150
  });

  public incrementScore(): void {
    this.activeUser.update(user => ({
      ...user,
      score: user.score + 10
    }));
  }
}
```

#### 3. Файл разметки демонстрационного компонента: `wrapper-demo.html`
```html
<div class="demo-container">
  <button (click)="incrementScore()">Добавить очки</button>

  <!-- Применяем директиву, пробрасывая данные. let-user забирает $implicit, let-time забирает timestamp -->
  <div *appDataWrapper="activeUser(); let user; let time = timestamp" class="user-card">
    <h4>Пользователь: {{ user.name }}</h4>
    <p>Уникальный ID: {{ user.id }}</p>
    <p>Количество очков: <strong>{{ user.score }}</strong></p>
    <small>Обновлено в: {{ time.toLocaleTimeString() }}</small>
  </div>
</div>
```

#### 4. Файл стилей демонстрационного компонента: `wrapper-demo.css`
```css
.demo-container {
  padding: 20px;
}

button {
  padding: 8px 16px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 16px;
}

.user-card {
  padding: 20px;
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
  border-radius: 8px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как работают TemplateRef и ViewContainerRef на уровне Ivy Engine
Для понимания механики работы структурных директив необходимо разобрать, во что превращается привычный HTML-шаблон при компиляции:

1.  **Раскрытие синтаксического сахара:**
    Когда компилятор Angular встречает символ звездочки `*` перед директивой, например:
    ```html
    <div *appRoleAccess="'admin'">Контент</div>
    ```
    Он преобразует эту строку во вложенную структуру с явным объявлением контейнера `<ng-template>`:
    ```html
    <ng-template [appRoleAccess]="'admin'">
      <div>Контент</div>
    </ng-template>
    ```
2.  **Генерация TView и LView:**
    Движок рендеринга Ivy делит представления на логические (`TView` — описание структуры шаблона) и физические (`LView` — инстанс шаблона с живыми данными и ссылками на нативные DOM-элементы). Тег `<ng-template>` парсится как статическая декларация в `TView`. Нода не создается в браузере автоматически.
3.  **Инъекция зависимостей:**
    *   Когда директива запрашивает `TemplateRef`, Angular возвращает ссылку на эту логическую инструкцию рендеринга шаблона.
    *   Когда директива запрашивает `ViewContainerRef`, Angular предоставляет доступ к невидимой служебной точке монтирования (Anchor Node), созданной на месте тега `<ng-template>`. Все динамически созданные элементы будут встроены в DOM непосредственно после этого якоря.

### 2. Сравнение производительности: Шаблонный рендеринг vs Манипуляции Renderer2
Часто возникает вопрос: почему для создания сложных интерфейсов нельзя использовать `Renderer2`?

| Критерий оценки | TemplateRef + ViewContainerRef | Прямая манипуляция (Renderer2) |
| :--- | :--- | :--- |
| **Производительность** | Высокая. Компилятор Angular заранее собирает структуру дерева в бинарные инструкции Ivy. | Средняя. Требуются многократные вызовы методов создания и встраивания нод по одной. |
| **Связывание данных (Data Binding)** | Нативное. Переменные шаблона автоматически отслеживаются реактивным ядром Angular. | Ручное. При изменении данных разработчик должен вручную переписывать текст элементов. |
| **Безопасность (XSS)** | Встроенная. Шаблоны экранируются и защищаются автоматически. | Ручная. При вставке сырого HTML через `innerHTML` высок риск инъекций. |
| **Удобство поддержки** | Высокое. Разметка остается в HTML-файле, логика — в TS. | Низкое. Верстка переносится в императивный JS-код («спагетти-код»). |

### 3. Детальный пошаговый разбор жизненного цикла условного рендеринга
Разберем этапы рендеринга шаблона с директивой `RoleAccess` (Шаблон 1):

1.  **Инициализация инжектора:** Angular рендерит шаблон и обнаруживает якорь `[appRoleAccess]`. Создается экземпляр класса `RoleAccess`.
2.  **Внедрение DI:** Вызываются функции `inject()`. Директива получает ссылку на свой `TemplateRef` и `ViewContainerRef`. На этом этапе в DOM еще ничего не отрисовано.
3.  **Активация эффекта:** В конструкторе регистрируется `effect`. Он делает первичный запуск, считывая значение сигнала `appRoleAccess` (например, `'admin'`) и значение сигнала `authState.currentRole()` (например, `'guest'`). Реактивный граф регистрирует эти сигналы как зависимости эффекта.
4.  **Ветвление логики (Очистка):** Поскольку условия не совпадают (`guest !== admin`), выполняется метод `this.viewContainer.clear()`. Контейнер пуст, выполнение завершено.
5.  **Переключение роли:** Пользователь нажимает кнопку «Войти как Админ». Сигнал `authState.currentRole` обновляется на `'admin'`.
6.  **Триггер эффекта:** Angular замечает изменение зависимости, планирует микрозадачу и запускает код эффекта повторно.
7.  **Генерация представления:** Условие совпадает (`admin === admin`). Вызывается `this.viewContainer.createEmbeddedView(this.templateRef)`. Ivy создает физический `LView`, транслирует его в нативные DOM-элементы и вставляет в дерево сразу за якорем директивы. Пользователь видит админ-панель.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Утечки памяти из-за неконтролируемого накопления Embedded View**
    *   *Симптомы:* Медленный рост потребления оперативной памяти, дублирование одних и тех же элементов в интерфейсе при частой смене условий.
    *   *Физика процесса:* При совпадении условий разработчик вызывает `viewContainer.createEmbeddedView()`, но забывает очистить контейнер при изменении условий на противоположные, либо повторно вызывает создание представления без проверки `this.viewContainer.length === 0`.
    *   *Решение:* Перед повторным рендерингом всегда проверяйте текущую заполненность контейнера или вызывайте метод `clear()`, как показано во всех шаблонах.

```typescript
// ПЛОХО (Представления будут плодиться при каждом изменении сигнала)
effect(() => {
  if (this.condition()) {
    this.viewContainer.createEmbeddedView(this.templateRef);
  }
});

// ХОРОШО (Строгий контроль наполнения контейнера)
effect(() => {
  if (this.condition()) {
    if (this.viewContainer.length === 0) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    }
  } else {
    this.viewContainer.clear();
  }
});
```

*   **Ошибка 2: Ошибка контекста шаблона (Context type-safety mismatch)**
    *   *Симптомы:* Переменные шаблона, объявленные через `let-data`, возвращают значение `undefined`, хотя сам объект данных гарантированно существует и передан.
    *   *Физика процесса:* Angular связывает let-переменные без явного указания имени со специальным свойством `$implicit` в передаваемом объекте контекста. Если вы передали объект вида `{ myData: value }`, но в HTML написали `let-data`, Angular будет искать `$implicit` в объекте и запишет в переменную `undefined`.
    *   *Решение:* Для дефолтного биндинга (без знака равенства) всегда используйте свойство `$implicit` внутри объекта контекста. Для именованных свойств объявляйте строгое соответствие в интерфейсе контекста.

```typescript
// ПЛОХО (let-item будет undefined)
this.viewContainer.createEmbeddedView(this.templateRef, { item: data });

// ХОРОШО (let-item заберет данные из $implicit)
this.viewContainer.createEmbeddedView(this.templateRef, { $implicit: data });
```

*   **Ошибка 3: Изменение состояния родительских компонентов во время рендеринга (ExpressionChangedAfterItHasBeenCheckedError)**
    *   *Симптомы:* Приложение падает в режиме разработки (DevMode) с критической ошибкой контроля изменений.
    *   *Физика процесса:* Директива динамически создает представление и в этот же синхронный момент времени пытается изменить состояние родительского компонента через `@Output` или прямую запись в родительский сигнал. Angular уже завершил проверку дерева разметки родителя и фиксирует некорректное изменение данных "вдогонку" текущему циклу.
    *   *Решение:* Переносите любые побочные эффекты изменения состояний, влияющие на другие компоненты, в асинхронные макро- или микротаски (`Promise.resolve()`, `setTimeout()`) или используйте реактивное обновление сигналов, которое Angular корректно планирует самостоятельно.