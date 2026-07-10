---
tags: [angular, тестирование, component-test]
related: ["[[Тестирование изолированного сервиса (Unit Test).md]]"]
status: "completed"
---

# Тестирование рендеринга и кликов (Component Test)

## БЫСТРЫЙ СТАРТ

*   **Интеграционный тест компонента (Component Test / Spec)** — это проверка корректности связывания логики класса компонента с его HTML-шаблоном. Он подтверждает, что переданные во входные свойства данные правильно отображаются в DOM, а клики по кнопкам вызывают нужные обработчики и генерируют ожидаемые события.
*   **Класс `ComponentFixture`** — это системная обертка Angular TestBed над тестируемым компонентом. Она предоставляет доступ к инстансу класса (`fixture.componentInstance`) и его скомпилированному HTML-элементу (`fixture.nativeElement`).
*   **Утилита `DebugElement`** позволяет безопасно искать элементы внутри дерева шаблона с помощью селекторов (`debugElement.query(By.css(...))`) и эмулировать нативные события браузера.
*   **Используйте:** Для проверки UI-логики: отображения условных блоков (`@if`), циклов (`@for`), правильности передачи классов и стилей, а также генерации выходных событий (`output()`).
*   **Не используйте:** Для тестирования сложной чистой бизнес-логики без привязки к шаблону (для этого подходят более быстрые и легковесные `Unit Tests` сервисов).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Тестируемый компонент карточки пользователя (UserCard)
*   **Назначение:** Описание логики современного Standalone-компонента на Сигналах, который принимает профиль пользователя через `input()` и генерирует событие выбора через `output()`.

#### 1. Файл типов данных: `user-types.ts`
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}
```

#### 2. Файл логики компонента: `user-card.ts`
```typescript
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { User } from './user-types';

@Component({
  selector: 'app-user-card',
  templateUrl: './user-card.html',
  styleUrl: './user-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush требует правильного запуска проверок в тестах
})
export class UserCard {
  // Входной параметр-сигнал для приема профиля пользователя
  public readonly user = input.required<User>();

  // Выходной канал для уведомления о клике
  public readonly selected = output<string>();

  public onSelect(): void {
    // Генерируем событие выбора, передавая идентификатор пользователя
    this.selected.emit(this.user().id);
  }
}
```

#### 3. Файл разметки компонента: `user-card.html`
```html
<div class="card-container" [class.admin-style]="user().isAdmin">
  <h4 class="user-name">{{ user().name }}</h4>
  <p class="user-email">{{ user().email }}</p>

  @if (user().isAdmin) {
    <span class="badge">Администратор</span>
  }

  <button class="select-btn" (click)="onSelect()">Выбрать профиль</button>
</div>
```

#### 4. Файл стилей компонента: `user-card.css`
```css
.card-container {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.card-container.admin-style {
  border-color: var(--accent);
}

.badge {
  background-color: var(--accent);
  color: white;
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 4px;
}

.select-btn {
  margin-top: 12px;
  padding: 6px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
}
```

---

### Шаблон 2: Спек-файл интеграционного теста (user-card.spec.ts)
*   **Назначение:** Полное покрытие тестами рендеринга шаблона `UserCard` с использованием современного API Angular 19+ для изменения входных сигналов (`setInput`) и проверки генерации событий.

```typescript
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement } from '@angular/core';
import { UserCard } from './user-card';
import { User } from './user-types';

describe('UserCard (Component Test)', () => {
  let component: UserCard;
  let fixture: ComponentFixture<UserCard>;
  let el: DebugElement;

  // Создаем тестовые данные (Mocks)
  const mockUser: User = {
    id: 'usr-12',
    name: 'Иван Иванов',
    email: 'ivan@web-archive.org',
    isAdmin: false
  };

  beforeEach(async () => {
    // Настраиваем тестовую среду Angular
    await TestBed.configureTestingModule({
      imports: [UserCard] // Импортируем тестируемый Standalone-компонент
    }).compileComponents(); // Компилируем HTML и CSS шаблоны

    // Создаем экземпляр фикстуры компонента
    fixture = TestBed.createComponent(UserCard);
    component = fixture.componentInstance;
    el = fixture.debugElement; // Получаем доступ к DebugElement
  });

  it('должен успешно создаваться в тестовой среде', () => {
    expect(component).toBeTruthy();
  });

  it('должен корректно отображать имя и почту пользователя в DOM', () => {
    // 1. Устанавливаем входной сигнал с помощью современного API Angular 19+ (fixture.componentRef.setInput)
    // Это гарантирует корректный триггер Change Detection для OnPush-компонентов!
    fixture.componentRef.setInput('user', mockUser);

    // 2. Запускаем цикл проверки изменений для рендеринга шаблона
    fixture.detectChanges();

    // 3. Ищем элементы в DOM по CSS-классам
    const nameElement = el.query(By.css('.user-name')).nativeElement as HTMLElement;
    const emailElement = el.query(By.css('.user-email')).nativeElement as HTMLElement;

    // 4. Сверяем текстовое содержимое
    expect(nameElement.textContent).toContain('Иван Иванов');
    expect(emailElement.textContent).toContain('ivan@web-archive.org');
  });

  it('не должен отображать бэдж админа для обычного пользователя', () => {
    fixture.componentRef.setInput('user', mockUser);
    fixture.detectChanges();

    const badge = el.query(By.css('.badge'));
    expect(badge).toBeNull(); // Элемент не должен быть отрендерен
  });

  it('должен отобразить бэдж и применить класс стилей для администратора', () => {
    const adminUser: User = { ...mockUser, isAdmin: true };
    
    fixture.componentRef.setInput('user', adminUser);
    fixture.detectChanges();

    // Проверяем рендеринг бэджа
    const badge = el.query(By.css('.badge')).nativeElement as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('Администратор');

    // Проверяем динамическое наложение CSS-класса на контейнер
    const container = el.query(By.css('.card-container')).nativeElement as HTMLElement;
    expect(container.classList.contains('admin-style')).toBeTrue();
  });

  it('должен сгенерировать событие selected при клике на кнопку', () => {
    fixture.componentRef.setInput('user', mockUser);
    fixture.detectChanges();

    let emittedId: string | undefined;
    
    // Подписываемся на выходной канал (output) компонента для перехвата события
    component.selected.subscribe(id => {
      emittedId = id;
    });

    // Находим кнопку в DOM шаблона
    const button = el.query(By.css('.select-btn'));

    // Эмулируем клик пользователя по кнопке
    button.triggerEventHandler('click', null);

    // Проверяем, что событие сгенерировалось с правильными данными
    expect(emittedId).toBe('usr-12');
  });
});
```

---

### Шаблон 3: Тестирование асинхронных операций с использованием `fakeAsync` и `tick`
*   **Назначение:** Спек-файл демонстрирует проверку состояний лоадеров при кликах на кнопки, которые вызывают асинхронные таймеры или HTTP-запросы внутри компонента.

#### 1. Файл тестов: `async-action.spec.ts`
```typescript
import { TestBed, ComponentFixture, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DebugElement, signal, Component, ChangeDetectionStrategy } from '@angular/core';

// Вспомогательный демонстрационный компонент для асинхронного теста
@Component({
  selector: 'app-async-btn',
  template: `
    <button class="action-btn" (click)="loadData()" [disabled]="isLoading()">
      {{ isLoading() ? 'Загрузка...' : 'Запустить' }}
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
class AsyncBtn {
  public readonly isLoading = signal<boolean>(false);

  public loadData(): void {
    this.isLoading.set(true);
    // Эмулируем асинхронную задержку
    setTimeout(() => {
      this.isLoading.set(false);
    }, 2000);
  }
}

describe('AsyncBtn (fakeAsync Test)', () => {
  let fixture: ComponentFixture<AsyncBtn>;
  let el: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AsyncBtn] // Декларируем локальный тестовый компонент
    }).compileComponents();

    fixture = TestBed.createComponent(AsyncBtn);
    el = fixture.debugElement;
    fixture.detectChanges();
  });

  // Оборачиваем тест в утилиту fakeAsync для полного контроля над временем в таймерах!
  it('должен временно переключать текст кнопки в состояние загрузки при клике', fakeAsync(() => {
    const button = el.query(By.css('.action-btn'));
    
    // Проверяем стартовый текст кнопки
    expect(button.nativeElement.textContent).toContain('Запустить');

    // Кликаем по кнопке
    button.triggerEventHandler('click', null);
    fixture.detectChanges(); // Запускаем рендеринг состояния isLoading = true

    // Текст должен измениться на лоадер
    expect(button.nativeElement.textContent).toContain('Загрузка...');
    expect(button.nativeElement.disabled).toBeTrue();

    // Виртуально перематываем время вперед на 2000 миллисекунд (имитируем работу setTimeout)
    tick(2000);
    fixture.detectChanges(); // Запускаем рендеринг состояния isLoading = false

    // Кнопка должна вернуться в исходное состояние
    expect(button.nativeElement.textContent).toContain('Запустить');
    expect(button.nativeElement.disabled).toBeFalse();
  }));
});
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика интеграционного тестирования компонентов
Компонентный тест Angular — это запуск мини-приложения в изолированной песочнице. Сборщик `TestBed` собирает виртуальный контекст, компилирует шаблоны и создает физическое дерево DOM в оперативной памяти (с помощью браузерного движка Karma или JSDOM в Jest):

1.  **Компиляция шаблонов:**
    Метод `compileComponents()` преобразует декларативный код HTML и CSS в быстрые инструкции рендеринга Ivy Engine.
2.  **Связывание данных (Data Binding):**
    Angular не запускает проверку изменений автоматически при каждом изменении переменной в тесте (за исключением некоторых сценариев). Метод `fixture.detectChanges()` принудительно запускает цикл проверки изменений, сопоставляя реактивное состояние класса с узлами DOM-дерева фикстуры.
3.  **DebugElement vs NativeElement:**
    *   `fixture.nativeElement` возвращает стандартный объект `HTMLElement` браузера. С его помощью можно проверять нативные свойства элементов (текст, классы, атрибуты).
    *   `fixture.debugElement` — это умная обертка Angular над нативным элементом. Она позволяет выполнять безопасные кроссплатформенные запросы (`query()`), находить дочерние компоненты по классам-инжекторам и эмулировать системные вызовы Angular (например, триггерить обработчики событий).

### 2. Специфика тестирования OnPush компонентов на Сигналах в Angular 19+
Тестирование производительных компонентов со стратегией `ChangeDetectionStrategy.OnPush` накладывает серьезные ограничения на написание тестов:

*   **Проблема ручной перезаписи:** Если в тесте вы попытаетесь напрямую перезаписать свойство класса: `component.user = mockUser;`, а затем вызовите `fixture.detectChanges()`, OnPush-компонент не обновит разметку. Почему? Потому что OnPush проверяет изменения только при изменении ссылок входных свойств на уровне шаблона или при явном вызове `markForCheck()`.
*   **Решение Angular 19+ (`setInput`):**
    В современных версиях Angular тестирование входных сигналов должно выполняться строго через метод фикстуры `fixture.componentRef.setInput('имя_свойства', значение)`. Это нативное API имитирует реальное изменение данных родителем, гарантируя 100% корректный триггер цикла Change Detection для любых OnPush-экранов в тестах.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: ExpressionChangedAfterItHasBeenCheckedError внутри тестов**
    *   *Симптомы:* Тесты падают с критической ошибкой `ExpressionChangedAfterItHasBeenCheckedError` при первом же вызове `fixture.detectChanges()`.
    *   *Физика процесса:* В коде компонента (например, в хуке `ngOnInit` или `ngAfterViewInit`) происходит немедленное синхронное изменение реактивного состояния, влияющее на разметку родителя, уже после того, как Angular завершил первый цикл рендеринга в тесте.
    *   *Решение:* Переносите изменения состояний в асинхронный контекст (таймеры, микрозадачи) или используйте сигналы, обновления которых планируются фреймворком корректно.

*   **Ошибка 2: Пропуск вызова detectChanges() (Пустой экран в тестах)**
    *   *Симптомы:* Тест падает с ошибкой `Cannot read properties of null` или `Expected '' to contain 'Иван'`.
    *   *Физика процесса:* Разработчик установил новые входные данные для компонента через `setInput()`, но забыл вызвать `fixture.detectChanges()`. В итоге класс обновил свои свойства, но HTML-шаблон остался неотрендеренным (пустым), из-за чего тесты не могут найти нужные текстовые ноды в DOM.
    *   *Решение:* Всегда вызывайте `fixture.detectChanges()` сразу после изменения любых входных данных, сигналов или эмуляции кликов в тесте, чтобы принудительно синхронизировать состояние класса с разметкой DOM.

```typescript
// ПЛОХО (Спек упадет, так как DOM еще не знает про новые данные)
fixture.componentRef.setInput('user', mockUser);
const name = el.query(By.css('.user-name')).nativeElement.textContent;
expect(name).toContain('Иван');

// ХОРОШО (Синхронизация данных гарантирует успешный тест)
fixture.componentRef.setInput('user', mockUser);
fixture.detectChanges(); // Принудительно рендерим шаблон
const name = el.query(By.css('.user-name')).nativeElement.textContent;
expect(name).toContain('Иван');
```

*   **Ошибка 3: Ошибки при эмуляции нативных кликов без флага fakeAsync**
    *   *Симптомы:* Асинхронные анимации, лоадеры или таймеры внутри компонентов не завершаются во время тестов, приводя к хаотичным падениям проверок на CI.
    *   *Физика процесса:* Вы кликнули на кнопку, которая запускает асинхронный процесс (например, скрывает лоадер через 2 секунды). Тест проверяет скрытие лоадера синхронно, не дожидаясь завершения таймаута, и падает.
    *   *Решение:* Оборачивайте асинхронные тесты в утилиту `fakeAsync` и принудительно перематывайте виртуальное время вперед с помощью вызова `tick(миллисекунды)` перед выполнением проверок `expect()` (как детально продемонстрировано в Шаблоне 3).