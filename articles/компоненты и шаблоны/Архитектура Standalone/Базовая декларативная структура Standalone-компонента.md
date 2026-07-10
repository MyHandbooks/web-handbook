---
tags: [angular, компоненты-и-шаблоны, архитектура]
related: ["[[Условные блоки в шаблоне (@if, @else).md]]", "[[Входные свойства на Сигналах (input).md]]"]
status: "completed"
---

# Базовая декларативная структура Standalone-компонента

## БЫСТРЫЙ СТАРТ

*   **Standalone-компонент** — независимый и самодостаточный кирпичик пользовательского интерфейса, у которого свойство `standalone` в декораторе `@Component` выставлено в значение `true`. Он явно описывает все свои зависимости (компоненты, директивы, пайпы) в массиве `imports`, что полностью устраняет потребность во внешних модулях Angular (`NgModule`).
*   **Локальный контекст компиляции:** Каждый standalone-компонент создает замкнутую и изолированную область видимости. Компилятор Ivy (`ngtsc`) компилирует шаблон компонента, опираясь исключительно на импорты, указанные внутри декоратора.
*   **Правила использования:**
    *   **Используйте:** Для всех создаваемых компонентов, директив и пайпов во всех новых проектах на Angular для обеспечения лучшей модульности, легкой ленивой загрузки и оптимизации размера бандла.
    *   **Не используйте:** Только при интеграции со старыми библиотеками, требующими объявления исключительно внутри `NgModule`, либо в монолитных legacy-модулях до начала плановой миграции.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Базовый автономный компонент с функциональным DI и Сигналами
*   **Назначение:** Описание базовой структуры автономного компонента с внедрением сервиса через `inject()`, реактивными переменными и явным импортом стандартных пайпов.

```typescript
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { LoggingService } from './services/logging.service';

@Component({
  selector: 'app-base-standalone',
  standalone: true, // Включает автономный режим, отвязывая компонент от классических NgModule
  imports: [
    DatePipe,       // Явный импорт пайпа для форматирования даты в шаблоне
    UpperCasePipe   // Явный импорт пайпа для приведения текста к верхнему регистру
  ],
  template: `
    <div class="card">
      <h2>{{ formattedTitle() }}</h2>
      <p>Последнее обновление: {{ lastUpdated() | date:'mediumTime' }}</p>
      <button (click)="updateState()">Обновить состояние</button>
    </div>
  `,
  styles: [`
    .card {
      border: 1px solid var(--border);
      padding: 16px;
      border-radius: 8px;
      background-color: var(--bg-secondary);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush // Оптимальная OnPush-стратегия для работы с иммутабельными данными и Сигналами
})
export class BaseStandaloneComponent {
  // Внедрение зависимостей через современную функцию inject() вне конструктора
  private readonly logger = inject(LoggingService);

  // Объявление реактивного состояния через Сигналы
  readonly title = signal<string>('базовая структура');
  readonly lastUpdated = signal<Date>(new Date());

  // Декларативное вычисление производного состояния (мемоизация)
  readonly formattedTitle = computed(() => {
    return `Компонент: ${this.title().toUpperCase()}`;
  });

  updateState(): void {
    const now = new Date();
    this.title.set('состояние обновлено');
    this.lastUpdated.set(now);
    
    // Логирование действия с использованием внедренной службы
    this.logger.log('Состояние компонента было обновлено вручную.');
  }
}
```

---

### Шаблон 2: Standalone-компонент с изолированными локальными провайдерами (ElementInjector)
*   **Назначение:** Создание компонента с локальным временем жизни службы, которая создается заново для каждого экземпляра и уничтожается вместе с ним.

```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { LocalDataService } from './services/local-data.service';

@Component({
  selector: 'app-scoped-standalone',
  standalone: true,
  imports: [], // Нет внешних зависимостей в шаблоне, массив импортов пуст
  providers: [
    LocalDataService // Изолированный провайдер уровня компонента (создается новый экземпляр для каждого тега)
  ],
  template: `
    <div class="scoped-container">
      <p>Локальный идентификатор сессии: {{ sessionId() }}</p>
    </div>
  `,
  styles: [`
    .scoped-container {
      padding: 12px;
      border-left: 4px solid var(--accent);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScopedStandaloneComponent {
  // Внедряем службу, которая изолирована на уровне ElementInjector этого компонента
  private readonly dataService = inject(LocalDataService);

  // Считываем реактивное значение из локального сервиса
  readonly sessionId = signal<string>(this.dataService.getUniqueSessionId());
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Локальный компиляционный контекст в Ivy
В классической архитектуре Angular контекст компиляции шаблона задавался на уровне `NgModule`. Компилятор сопоставлял все компоненты, объявленные в модуле, со всеми импортированными модулями, чтобы понять, какие теги и пайпы валидны внутри шаблона.

В standalone-компонентах этот процесс происходит точечно на уровне самого компонента. Массив `imports` декларативно описывает локальный компиляционный контекст. Преимущества такого подхода:
*   **Усиленный Tree-shaking:** Сборщики кода могут точно отследить, какие именно компоненты и директивы используются в приложении, и полностью исключить неиспользуемые импорты из финального бандла.
*   **Быстрая инкрементальная компиляция:** Компилятор `ngtsc` анализирует только изменившийся файл компонента и его явные импорты, не перестраивая граф связей всего модуля.

### 2. Слой внедрения зависимостей: ElementInjector против EnvironmentInjector
Переход на автономные компоненты изменил иерархию инжекторов в Angular. Ранее модули, загружаемые лениво, создавали дочерний контекст `NgModuleRef`, содержащий собственный `EnvironmentInjector`.

В standalone-архитектуре:
1.  **EnvironmentInjector:** Конфигурируется на уровне всего приложения (`bootstrapApplication`) и на уровне конфигурации маршрутов (`routes`), где можно объявить глобальные или лениво загружаемые провайдеры через свойство `providers` в объекте `Route`.
2.  **ElementInjector:** Создается на уровне DOM-элемента каждого компонента. Когда мы объявляем службу в массиве `providers` декоратора `@Component`, она регистрируется в `ElementInjector`. Экземпляр этой службы будет уничтожен автоматически, когда компонент удаляется из DOM-дерева.

### 3. Пошаговый разбор жизненного цикла и инициализации шаблона
При инициализации `BaseStandaloneComponent` происходят следующие шаги:
1.  **Регистрация метаданных:** Компилятор считывает флаг `standalone: true` и проверяет наличие директив, указанных в `imports`.
2.  **Разрешение DI:** Вызывается функция `inject(LoggingService)`. Поиск провайдера начинается с текущего `ElementInjector`, проходит вверх по DOM-дереву и завершается на уровне `EnvironmentInjector` (где служба зарегистрирована через `{ providedIn: 'root' }`).
3.  **Инициализация реактивного графа:** Создаются реактивные узлы для сигналов `title` и `lastUpdated`. Компилятор строит зависимость для `formattedTitle`. При первом чтении значения `formattedTitle` в шаблоне Angular подписывается на изменения сигнала `title`.
4.  **Рендеринг:** Пайпы `DatePipe` и `UpperCasePipe` создаются локально внутри фабрики рендеринга Ivy и применяются к интерполяционным переменным.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Использование стандартных директив или пайпов без явного импорта**
    *   *Симптомы:* Ошибки компиляции шаблона: `NG8002: Can't bind to 'ngClass' since it isn't a known property...` при попытке применить `[ngClass]`.
    *   *Физика процесса:* Шаблон standalone-компонента изолирован от глобального окружения. Стандартные директивы типа `NgClass`, `NgStyle` или `NgIf` (при работе без современного Control Flow) должны быть явно указаны в `imports`.
    *   *Решение:* Добавить нужный класс директивы в массив `imports`.

```typescript
// ОШИБКА: Использование [ngClass] в шаблоне вызовет сбой компиляции, если NgClass не импортирован
@Component({
  standalone: true,
  template: `<div [ngClass]="{ active: isActive() }">Контент</div>`
})
export class FaultyComponent {}

// ИСПРАВЛЕНИЕ: Добавление NgClass в массив imports
import { NgClass } from '@angular/common';

@Component({
  standalone: true,
  imports: [NgClass],
  template: `<div [ngClass]="{ active: isActive() }">Контент</div>`
})
export class FixedComponent {}
```

*   **Ошибка 2: Циклические зависимости при взаимном импорте (Circular Dependency)**
    *   *Симптомы:* Ошибка времени выполнения `ReferenceError: Cannot access '...' before initialization` или падение процесса сборки.
    *   *Физика процесса:* `ComponentA` импортирует `ComponentB` для использования в шаблоне, а `ComponentB` импортирует `ComponentA` для тех же целей. На этапе инициализации рантайма ES-модули не могут разрешить ссылки друг на друга.
    *   *Решение:* Выделить общие части в отдельный презентационный дочерний компонент или использовать абстракции (интерфейсы или DI-токены) для бесконтактного взаимодействия.

```typescript
// ОШИБКА: Прямой перекрестный импорт standalone-компонентов
// component-a.ts: imports: [ComponentB]
// component-b.ts: imports: [ComponentA]

// ИСПРАВЛЕНИЕ: Перевод одного из компонентов на управление через проекцию разметки (ng-content)
// component-a.ts: imports: [] (принимает контент динамически)
@Component({
  selector: 'app-component-a',
  standalone: true,
  template: `<div class="wrapper"><ng-content></ng-content></div>`
})
export class ComponentA {}
```

*   **Ошибка 3: Утечка состояния синглтона при ошибочной регистрации в providers компонента**
    *   *Симптомы:* Состояние службы сбрасывается или дублируется при переходе между страницами; разные экземпляры компонентов получают несинхронизированные данные.
    *   *Физика процесса:* Если глобальный сервис регистрируется в массиве `providers` на уровне компонента, Angular создает новый экземпляр этого сервиса на уровне `ElementInjector` для каждого рендерируемого компонента, игнорируя корневой синглтон.
    *   *Решение:* Убрать службу из массива `providers` компонента и объявить её как `providedIn: 'root'`.

```typescript
// ОШИБКА: Глобальная служба регистрируется локально, создавая дубликат экземпляра
@Component({
  standalone: true,
  providers: [GlobalStateService] 
})
export class SidebarComponent {}

// ИСПРАВЛЕНИЕ: Регистрация только на корневом уровне
@Injectable({
  providedIn: 'root'
})
export class GlobalStateService {}
```