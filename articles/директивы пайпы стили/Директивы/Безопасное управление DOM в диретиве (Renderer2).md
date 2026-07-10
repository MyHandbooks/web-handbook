---
tags: [angular, директивы, рендеринг]
related: ["[[Управление рендерингом в директиве (TemplateRef).md]]", "[[Управление инкапсуляцией стилей (ViewEncapsulation).md]]"]
status: "completed"
---

# Безопасное управление DOM в директиве (Renderer2)

## БЫСТРЫЙ СТАРТ

*   **Класс `Renderer2`** — это встроенный сервисный слой абстракции Angular над нативным DOM-API браузера. Он предназначен для безопасного изменения стилей, классов, атрибутов и структуры элементов.
*   **Абстракция платформы:** Использование `Renderer2` гарантирует, что ваше приложение будет стабильно работать и не упадет с ошибкой в средах, где нативный DOM отсутствует или ограничен (например, при серверном рендеринге SSR в Node.js, статической генерации SSG или в Web Workers).
*   **Используйте:** Для написания переиспользуемых директив, которые динамически меняют стили хост-элемента при взаимодействии, безопасно создают и встраивают дочерние элементы или слушают глобальные события браузера.
*   **Не используйте:** Прямое обращение к нативным свойствам вида `elementRef.nativeElement.style.color = 'red'` — это нарушает архитектуру Angular, ломает SSR и подвергает приложение уязвимостям XSS (межсайтового скриптинга).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Директива hover-эффектов с безопасным изменением стилей (HoverAccent)
*   **Назначение:** Директива динамически меняет цвет фона и масштаб элемента при наведении курсора, используя `@HostListener` и `Renderer2` для безопасной манипуляции стилями.

#### 1. Файл директивы: `hover-accent.ts`
```typescript
import { Directive, inject, ElementRef, Renderer2, HostListener, input } from '@angular/core';

@Component({ }) // Директива объявляется ниже. standalone: true по умолчанию в Angular 19+
@Directive({
  selector: '[appHoverAccent]' // Селектор для использования в HTML как атрибут
})
export class HoverAccent { // Имя класса не содержит суффикса Directive
  private readonly el = inject(ElementRef); // Внедряем ссылку на хост-элемент
  private readonly renderer = inject(Renderer2); // Внедряем безопасный рендерер

  // Входной сигнальный параметр для кастомизации цвета наведения
  public readonly hoverColor = input<string>('var(--accent)');

  // Слушаем нативное событие входа курсора на элемент
  @HostListener('mouseenter') 
  public onMouseEnter(): void {
    const nativeEl = this.el.nativeElement;
    // Безопасно устанавливаем фоновый цвет
    this.renderer.setStyle(nativeEl, 'background-color', this.hoverColor());
    // Безопасно накладываем трансформацию
    this.renderer.setStyle(nativeEl, 'transform', 'scale(1.02)');
  }

  // Слушаем событие ухода курсора с элемента
  @HostListener('mouseleave') 
  public onMouseLeave(): void {
    const nativeEl = this.el.nativeElement;
    // Безопасно очищаем стили до их дефолтных значений
    this.renderer.removeStyle(nativeEl, 'background-color');
    this.renderer.removeStyle(nativeEl, 'transform');
  }
}
```

#### 2. Файл логики демонстрационного компонента: `hover-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { HoverAccent } from './hover-accent';

@Component({
  selector: 'app-hover-demo',
  imports: [HoverAccent], // Импортируем нашу директиву для использования в шаблоне
  templateUrl: './hover-demo.html',
  styleUrl: './hover-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HoverDemo { }
```

#### 3. Файл разметки демонстрационного компонента: `hover-demo.html`
```html
<div class="demo-wrapper">
  <!-- Применяем директиву к карточке, передавая кастомный цвет в инпут-сигнал -->
  <div class="interactive-card" appHoverAccent [hoverColor]="'var(--nav-active)'">
    <h4>Интерактивный элемент</h4>
    <p>Наведите курсор для проверки безопасного изменения стилей.</p>
  </div>
</div>
```

#### 4. Файл стилей демонстрационного компонента: `hover-demo.css`
```css
.demo-wrapper {
  padding: 20px;
}

.interactive-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-secondary);
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease;
}
```

---

### Шаблон 2: Безопасное создание и добавление дочерних элементов (AppendIcon)
*   **Назначение:** Директива динамически создает нативный текстовый бэдж-индикатор в правом углу элемента, используя методы создания и встраивания `Renderer2` для соблюдения кроссплатформенного стандарта.

#### 1. Файл директивы: `append-icon.ts`
```typescript
import { Directive, inject, ElementRef, Renderer2, OnInit, input } from '@angular/core';

@Directive({
  selector: '[appAppendIcon]'
})
export class AppendIcon implements OnInit {
  private readonly el = inject(ElementRef);
  private readonly renderer = inject(Renderer2);

  // Текст бэджа, передаваемый снаружи
  public readonly badgeText = input<string>('New');

  public ngOnInit(): void {
    const parentNode = this.el.nativeElement;

    // 1. Безопасно создаем элемент span. 
    // Прямой вызов document.createElement() запрещен, так как на сервере Node.js объекта document нет!
    const badgeSpan = this.renderer.createElement('span');

    // 2. Безопасно создаем текстовый узел
    const textNode = this.renderer.createText(this.badgeText());

    // 3. Безопасно связываем текст со спаном
    this.renderer.appendChild(badgeSpan, textNode);

    // 4. Безопасно накладываем CSS-класс стилей
    this.renderer.addClass(badgeSpan, 'badge-indicator');

    // 5. Безопасно монтируем созданный спан в конец родительского элемента
    this.renderer.appendChild(parentNode, badgeSpan);
  }
}
```

#### 2. Файл логики демонстрационного компонента: `append-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AppendIcon } from './append-icon';

@Component({
  selector: 'app-append-demo',
  imports: [AppendIcon],
  templateUrl: './append-demo.html',
  styleUrl: './append-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppendDemo { }
```

#### 3. Файл разметки демонстрационного компонента: `append-demo.html`
```html
<div class="demo-wrapper">
  <!-- Применяем директиву, которая добавит бэдж внутрь кнопки -->
  <button class="menu-btn" appAppendIcon [badgeText]="'PRO'">
    Личный кабинет
  </button>
</div>
```

#### 4. Файл стилей демонстрационного компонента: `append-demo.css`
```css
.demo-wrapper {
  padding: 20px;
}

.menu-btn {
  padding: 10px 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text-normal);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 500;
}

/* Стили для класса, который директива динамически накладывает на созданный спан */
:host ::ng-deep .badge-indicator {
  background-color: var(--accent);
  color: white;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

---

### Шаблон 3: Директива глобального отслеживания со слушателем Renderer2.listen (GlobalClickTracker)
*   **Назначение:** Директива вешает безопасный слушатель событий клика на глобальный объект `document` с гарантированным автоматическим уничтожением слушателя при деструкции компонента через `DestroyRef`.

#### 1. Файл директивы: `global-click-tracker.ts`
```typescript
import { Directive, inject, OnInit, Renderer2, DestroyRef } from '@angular/core';

@Directive({
  selector: '[appGlobalClickTracker]'
})
export class GlobalClickTracker implements OnInit {
  private readonly renderer = inject(Renderer2);
  private readonly destroyRef = inject(DestroyRef); // Понадобится для ручной отписки от глобального слушателя

  public ngOnInit(): void {
    // Безопасно вешаем слушатель на глобальный объект 'document'.
    // Renderer2.listen возвращает функцию-деструктор (unlisten callback).
    const unlistenFn = this.renderer.listen('document', 'click', (event: MouseEvent) => {
      this.handleGlobalClick(event);
    });

    // Регистрируем функцию отписки в DestroyRef.
    // Это предотвратит утечку памяти, когда компонент с директивой будет удален с экрана.
    this.destroyRef.onDestroy(() => {
      console.warn('[Directive] Компонент уничтожается. Снимаем глобальный слушатель кликов.');
      unlistenFn(); // Вызываем возвращенную функцию для удаления слушателя из памяти браузера
    });
  }

  private handleGlobalClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    console.log('[Global Click] Клик по элементу:', target.tagName);
  }
}
```

#### 2. Файл логики демонстрационного компонента: `tracker-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { GlobalClickTracker } from './global-click-tracker';

@Component({
  selector: 'app-tracker-demo',
  imports: [GlobalClickTracker],
  templateUrl: './tracker-demo.html',
  styleUrl: './tracker-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TrackerDemo { }
```

#### 3. Файл разметки демонстрационного компонента: `tracker-demo.html`
```html
<div class="demo-wrapper" appGlobalClickTracker>
  <p>Кликните в любом месте этой страницы — директива зафиксирует событие через глобальный безопасный слушатель.</p>
</div>
```

#### 4. Файл стилей демонстрационного компонента: `tracker-demo.css`
```css
.demo-wrapper {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px dashed var(--border);
  border-radius: 8px;
  text-align: center;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Почему прямое обращение к DOM (nativeElement) — это критический антипаттерн
В традиционной веб-разработке на чистом JS или jQuery изменение элементов происходит через прямое обращение к дереву документа: `document.getElementById()`, `element.style.color = 'red'`. 

В Angular такое прямое обращение к `nativeElement` внутри директив считается грубым нарушением архитектуры по трем причинам:

1.  **Смерть Server-Side Rendering (SSR / Angular Universal):**
    При серверном рендеринге Angular-приложение запускается на сервере под управлением Node.js. В среде Node.js физически отсутствует объект `window`, `document` и дерево DOM. Попытка выполнить `element.nativeElement.style.color = 'red'` на сервере приведет к немедленному падению Node.js процесса с ошибкой `TypeError: Cannot read properties of undefined (reading 'style')`. `Renderer2` перехватывает эти вызовы и безопасно обрабатывает их на сервере, генерируя правильную строковую HTML-разметку для отправки клиенту.
2.  **Уязвимости XSS (Межсайтовый скриптинг):**
    Прямая вставка значений в свойства типа `innerHTML` открывает лазейку для инъекции вредоносного JS-кода злоумышленниками. `Renderer2` имеет встроенные механизмы экранирования и очистки данных.
3.  **Изоляция платформы (Web Workers):**
    Angular спроектирован так, чтобы иметь возможность запускать весь фреймворк и тяжелые вычисления в фоновом потоке браузера — Web Worker, оставляя основной поток свободным только для быстрой отрисовки пикселей. Web Worker не имеет доступа к DOM. `Renderer2` выступает в роли сетевого моста, передавая команды сериализации из потока Web Worker в основной поток рендеринга.

### 2. Как Renderer2 абстрагирует работу с платформой
`Renderer2` — это абстрактный класс. В зависимости от платформы, на которой запускается приложение, Angular подставляет через DI-контейнер нужный класс-реализацию:
*   *В браузере:* Подставляется `DefaultDomRenderer2`, который транслирует вызовы вроде `renderer.setStyle` в быстрые нативные инструкции `element.style.setProperty()`.
*   *На сервере Node.js:* Подставляется специализированный рендерер, который преобразует команды создания элементов и стилей в обычный строковый буфер сериализованного HTML-текста.

### 3. Детальный пошаговый разбор асинхронного слушателя событий
Проследим шаги инициализации и работы директивы `GlobalClickTracker` (Шаблон 3):

1.  **Парсинг шаблона:** Angular рендерит `<div appGlobalClickTracker>`. Инжектор создает экземпляр директивы.
2.  **Запуск `ngOnInit`:** Метод `ngOnInit` выполняет инструкцию `this.renderer.listen('document', 'click', ...)`.
3.  **Регистрация слушателя:** 
    *   *В браузере:* Рендерер вызывает нативный метод `document.addEventListener('click', callback)`. Возвращается функция отписки.
    *   *На сервере:* Рендерер понимает, что на сервере нет событий мыши, игнорирует вызов и возвращает пустую функцию-заглушку `() => {}`, предотвращая падение Node.js.
4.  **Клик пользователя:** Пользователь кликает на элемент. Нативный колбэк перехватывается, управление передается методу `handleGlobalClick()`.
5.  **Уничтожение:** Пользователь уходит со страницы. Вызывается `destroyRef.onDestroy()`. Запускается сохраненный колбэк `unlistenFn()`, который выполняет нативный `document.removeEventListener('click', callback)`, очищая оперативную память браузера от неиспользуемых ссылок.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Утечки памяти из-за неснятых слушателей событий в `Renderer2.listen`**
    *   *Симптомы:* Медленный рост потребления памяти (Memory Leak) и многократное дублирование выполнения логики кликов при длительной работе в приложении.
    *   *Физика процесса:* Метод `Renderer2.listen()` вешает глобальный слушатель на `window` или `document`. В отличие от `@HostListener` (который Angular очищает автоматически), глобальный слушатель, созданный через `listen()`, остается активным в памяти браузера даже после полного уничтожения директивы и компонента. Он продолжает удерживать ссылки на уничтоженный класс, блокируя сборщик мусора.
    *   *Решение:* Всегда сохраняйте возвращаемую функцию отписки и принудительно вызывайте её в деструкторе через `DestroyRef` или хук `ngOnDestroy` (как показано в Шаблоне 3).

```typescript
// ПЛОХО (Слушатель останется висеть в памяти браузера навсегда)
ngOnInit() {
  this.renderer.listen('document', 'scroll', () => { ... });
}

// ХОРОШО (Слушатель гарантированно удаляется при уничтожении компонента)
private readonly destroyRef = inject(DestroyRef);
ngOnInit() {
  const unlisten = this.renderer.listen('document', 'scroll', () => { ... });
  this.destroyRef.onDestroy(() => unlisten());
}
```

*   **Ошибка 2: Попытка чтения геометрических размеров элементов через Renderer2 (Layout Thrashing)**
    *   *Симптомы:* Просадки производительности (низкий FPS), мерцание интерфейса при анимации.
    *   *Физика процесса:* Разработчик пытается использовать `Renderer2` для вычисления ширины или высоты элемента (например, `renderer.getValue(...)`), но такого API у рендерера нет. Пытаясь обойти это, разработчик считывает `element.nativeElement.offsetWidth` напрямую внутри тяжелого цикла рендеринга, что заставляет браузер экстренно останавливать выполнение JS и делать пересчет геометрии макета (Layout Thrashing).
    *   *Решение:* Чтение геометрических размеров элементов в Angular всегда должно выполняться строго в браузере с защитной проверкой платформы `isPlatformBrowser(platformId)`. Читайте размеры один раз, а записывайте изменения стилей пачкой через `Renderer2`.

*   **Ошибка 3: Создание тяжелых иерархий элементов через Renderer2.createElement**
    *   *Симптомы:* Раздувание кода директивы, нечитаемый спагетти-код из сотен строк создания элементов, плохая масштабируемость.
    *   *Физика процесса:* Разработчик пытается создать сложную верстку карточки (шапка, тело, иконка, кнопки), последовательно вызывая `renderer.createElement` и `renderer.appendChild` 20 раз подряд внутри директивы.
    *   *Решение:* `Renderer2` предназначен строго для точечных, легких манипуляций с DOM. Если вам нужно динамически отрисовать тяжелую структуру верстки или целый блок интерфейса, используйте компоненты, либо проецируйте верстку через механизм `TemplateRef` и `ViewContainerRef`.