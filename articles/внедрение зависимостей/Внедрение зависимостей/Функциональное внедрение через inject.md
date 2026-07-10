---
tags: [angular, внедрение-зависимостей, архитектура]
related: ["[[Создание глобального синглтона (providedIn root).md]]", "[[Настройка поиска зависимостей (DI Modifiers).md]]"]
status: "completed"
---

# Функциональное внедрение через inject

## БЫСТРЫЙ СТАРТ

*   **Функция `inject()`** — это современное функциональное API для запроса зависимостей из текущего контекста внедрения Angular (Injection Context). Оно заменяет классическое внедрение через конструктор класса.
*   **Ограничение контекста (Injection Context):** Вызывать `inject()` можно только в фазе инициализации класса: при объявлении свойств класса, в теле конструктора или внутри фабрик провайдеров. Попытка вызвать `inject()` в методах жизненного цикла (`ngOnInit`) или в обработчиках событий (кликах) приведет к системной ошибке.
*   **Преимущества:**
    *   Полностью избавляет класс от бойлерплейта конструкторов.
    *   Решает проблему наследования: дочерним классам больше не нужно дублировать зависимости родительских классов в своих конструкторах и вызывать `super()`.
    *   Позволяет создавать переиспользуемые функциональные утилиты вне классов (например, функции для автоматической отписки, динамической смены заголовков вкладки).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Объявление свойств через `inject()` без конструктора
*   **Назначение:** Описание чистого компонента, все зависимости которого инициализируются непосредственно при объявлении полей.

#### 1. Файл логики: `data-viewer.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppConfigService } from './app-config.service';

@Component({
  selector: 'app-data-viewer',
  templateUrl: './data-viewer.html',
  styleUrl: './data-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataViewer {
  // Внедряем HttpClient без использования конструктора класса
  protected readonly http = inject(HttpClient);

  // Внедряем пользовательскую службу конфигурации
  protected readonly config = inject(AppConfigService);
}
```

#### 2. Файл разметки: `data-viewer.html`
```html
<div class="viewer">
  <span>Текущая конфигурация: {{ config.currentTheme() }}</span>
</div>
```

#### 3. Файл стилей: `data-viewer.css`
```css
.viewer {
  padding: 16px;
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
}
```

---

### Шаблон 2: Упрощение наследования классов
*   **Назначение:** Создание базовой абстрактной директивы с зависимостями и наследование дочернего компонента без необходимости писать конструктор и вызывать `super()`.

#### 1. Файл логики: `custom-button.ts`
```typescript
import { Component, Directive, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { AnalyticsService } from './analytics.service';

// Абстрактная директива (базовый класс), собирающая аналитику
@Directive()
export abstract class BaseAnalytics {
  // Базовый класс запрашивает зависимость аналитики самостоятельно
  protected readonly analytics = inject(AnalyticsService);
  
  // Базовый класс внедряет инструмент очистки ресурсов
  protected readonly destroyRef = inject(DestroyRef);
}

@Component({
  selector: 'app-custom-button',
  templateUrl: './custom-button.html',
  styleUrl: './custom-button.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomButton extends BaseAnalytics {
  // Дочерний класс наследует все свойства без объявления конструктора.
  // Нам не нужно писать "constructor(analytics: AnalyticsService, destroyRef: DestroyRef) { super(analytics, destroyRef) }"
  
  protected trackClick(): void {
    this.analytics.sendEvent('button_clicked', { timestamp: Date.now() });
  }
}
```

#### 2. Файл разметки: `custom-button.html`
```html
<button (click)="trackClick()">Отправить событие</button>
```

#### 3. Файл стилей: `custom-button.css`
```css
button {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
}
```

---

### Шаблон 3: Вынесение логики в переиспользуемую внешнюю функцию
*   **Назначение:** Создание внешней чистой функции, которая внедряет зависимости и автоматически вешает обработчик на событие уничтожения компонента.

#### 1. Файл логики: `dynamic-page.ts`
```typescript
import { Component, inject, DestroyRef, Signal, effect, ChangeDetectionStrategy, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

// Кастомная внешняя утилита для синхронизации заголовка вкладки с реактивным сигналом
export function useDocumentTitle(titleSignal: Signal<string>): void {
  // 1. Извлекаем глобальный объект документа из контекста внедрения
  const document = inject(DOCUMENT);
  
  // 2. Извлекаем инструмент отслеживания жизненного цикла текущего компонента
  const destroyRef = inject(DestroyRef);

  // 3. Создаем эффект для автоматического отслеживания изменений сигнала
  const titleEffect = effect(() => {
    document.title = titleSignal();
  });

  // 4. Гарантированно очищаем ресурсы при уничтожении потребителя утилиты
  destroyRef.onDestroy(() => {
    titleEffect.destroy();
  });
}

@Component({
  selector: 'app-dynamic-page',
  templateUrl: './dynamic-page.html',
  styleUrl: './dynamic-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DynamicPage {
  private readonly pageTitle = signal<string>('Начальный заголовок');

  constructor() {
    // Вызов утилиты разрешен в конструкторе, так как это часть контекста внедрения
    useDocumentTitle(this.pageTitle);
  }
}
```

#### 2. Файл разметки: `dynamic-page.html`
```html
<div class="page-container">
  <h1>Динамическая страница</h1>
</div>
```

#### 3. Файл стилей: `dynamic-page.css`
```css
.page-container {
  padding: 24px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика контекста внедрения (Injection Context) и `runInInjectionContext`
Функция `inject()` не принимает ссылку на инжектор в качестве прямого аргумента. Она определяет нужный инжектор неявно, опираясь на текущую глобальную переменную контекста. 

Когда Angular инициализирует класс компонента:
1.  Angular запоминает текущий инжектор в скрытую глобальную переменную среды.
2.  Запускается фаза инстанцирования (вызываются конструкторы и инициализируются свойства класса).
3.  Любой вызов `inject()` внутри этой фазы считывает ссылку из глобальной переменной и возвращает нужный экземпляр зависимости.
4.  После завершения инициализации глобальная переменная контекста очищается.

Если вы попытаетесь вызвать `inject()` позже (например, при клике пользователя), Angular не обнаружит активного контекста и выбросит ошибку `NG0203`.

При необходимости принудительно запустить код в контексте конкретного инжектора вне фазы инициализации, Angular предоставляет утилиту `runInInjectionContext`:
```typescript
import { runInInjectionContext, Injector } from '@angular/core';

runInInjectionContext(this.injector, () => {
  // Здесь вызов inject() снова становится легальным
  const service = inject(MyService);
});
```

### 2. Упрощение иерархии наследования (Constructor vs Functional Composition)
В классическом Angular (до появления `inject()`) наследование классов с зависимостями приводило к лавинообразному росту бойлерплейта. Если базовому классу требовалось добавить новую зависимость (например, сервис логирования), разработчику приходилось вручную менять сигнатуры конструкторов абсолютно всех дочерних классов по всей кодовой базе и прокидывать аргумент в `super()`.

С появлением `inject()` наследование очищается. Зависимости инкапсулируются на уровне объявления свойств. Дочерний класс получает все зависимости родителя "бесплатно", не зная о них на уровне своего конструктора, что кардинально упрощает рефакторинг и поддержку архитектуры.

### 3. Детальный пошаговый разбор механизма работы `inject` во внешней утилите
Разберем выполнение вызова `useDocumentTitle(this.pageTitle)` в компоненте `DynamicPage`:
1.  **Инстанцирование:** Angular начинает создавать `DynamicPage`. Устанавливается активный контекст инжектора текущего компонента.
2.  **Запуск конструктора:** Выполняется код конструктора класса. Вызывается внешняя функция `useDocumentTitle`.
3.  **Внутренний вызов `inject(DOCUMENT)`:** Функция `inject` обращается к текущему активному контексту инжектора. Инжектор успешно находит токен `DOCUMENT` в корневом провайдере и возвращает ссылку.
4.  **Регистрация уничтожения:** `inject(DestroyRef)` находит сервис отслеживания жизненного цикла текущего компонента. Обработчик `onDestroy` регистрирует колбэк очистки эффекта.
5.  **Завершение инициализации:** Конструктор завершает работу, контекст внедрения для данного компонента закрывается.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка `NG0203: inject() must be called from an active injection context`**
    *   *Проблема:* Разработчик пытается вызвать `inject()` внутри метода `ngOnInit` или в колбэке асинхронного потока.
    *   *Решение:* Перенесите вызов `inject()` на уровень объявления полей класса или непосредственно в конструктор.

```typescript
// ПЛОХО (Вызов inject внутри ngOnInit вызовет критическую ошибку в рантайме)
@Component({
  selector: 'app-bad',
  templateUrl: './bad.html',
  styleUrl: './bad.css'
})
export class Bad implements OnInit {
  private api!: ApiService;

  public ngOnInit(): void {
    // this.api = inject(ApiService); // ! Ошибка NG0203
  }
}

// ХОРОШО (Инициализация на уровне полей класса)
@Component({
  selector: 'app-good',
  templateUrl: './good.html',
  styleUrl: './good.css'
})
export class Good {
  private readonly api = inject(ApiService); // Полностью безопасно
}
```

*   **Ошибка 2: Смешивание стилей внедрения (Гибридный подход)**
    *   *Проблема:* Часть зависимостей класса внедряется через `inject()`, а часть — через параметры конструктора. Это усложняет чтение кода, нарушает единообразие архитектуры проекта и усложняет рефакторинг.
    *   *Решение:* Придерживайтесь одного выбранного стиля в рамках команды. Современный стандарт разработки в Angular 19+ рекомендует полностью отказаться от конструкторов в пользу функционального внедрения через `inject()`.

*   **Ошибка 3: Сложности при модульном тестировании без TestBed**
    *   *Проблема:* Разработчик пытается протестировать класс компонента как чистый класс, инициализируя его через `new MyComponent()`. Если в классе используется `inject()`, тест упадет с ошибкой контекста, так как при вызове через `new` контекст внедрения Angular не инициализируется.
    *   *Решение:* Всегда тестируйте компоненты с `inject()` с помощью стандартного `TestBed.configureTestingModule()`, который автоматически настраивает и изолирует контекст внедрения для каждой тестовой фикстуры. Если требуется ручное тестирование, используйте вспомогательный `Injector` для создания экземпляра.