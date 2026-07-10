---
tags: [angular, формы-и-валидация, реактивные-формы]
related: ["Реактивное отслеживание ввода (valueChanges).md", "Использование встроенных и кастомных валидаторов.md"]
status: "completed"
---

# Объявление структуры формы через FormBuilder

## БЫСТРЫЙ СТАРТ

*   **FormBuilder** — это встроенная вспомогательная служба Angular (DI-сервис), предоставляющая удобный декларативный синтаксис для быстрого конструирования строго типизированных реактивных форм (`FormGroup`, `FormControl`, `FormArray`).
*   **Архитектурное преимущество:** Избавляет от написания громоздких ручных конструкций вида `new FormGroup(...)`, разделяет логику, верстку и стилизацию по разным файлам, значительно сокращает объем шаблонного кода при работе со сложными иерархическими структурами и поддерживает строгий контроль типов на этапе компиляции.
*   **Правила использования:**
    *   **Используйте:** Для всех форм ввода, анкет, многостраничных конфигураторов и интерактивных полей данных, где требуется реактивное отслеживание, валидация и разделение логики и представления на отдельные файлы для лучшей поддержки.
    *   **Не используйте:** Для простейших одиночных полей ввода (например, изолированной строки живого поиска) — в таких сценариях проще объявить один независимый `new FormControl()` в одном `.ts` файле без привлечения целого сервиса `FormBuilder`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Базовая форма со строгой типизацией и защитой от null-значений
*   **Назначение:** Описание структуры формы авторизации/регистрации пользователя с дефолтными значениями, базовой валидацией и использованием сервиса `NonNullableFormBuilder` во внешних файлах.

#### 1. Файл логики: `auth-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

@Component({
  selector: 'app-auth-form',
  // Для работы реактивных форм в шаблоне обязательно импортируется ReactiveFormsModule.
  // standalone: true активен по умолчанию начиная с v19 и больше не объявляется вручную.
  imports: [ReactiveFormsModule], 
  // Указываем пути к внешним файлам представления и стилизации без суффиксов в названии файлов
  templateUrl: './auth-form.html',
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush-стратегия минимизирует проверки при работе с формами
})
export class AuthForm { // Согласно современной спецификации суффикс Component больше не пишется в названии класса
  // Внедряем NonNullableFormBuilder через функцию inject() вне конструктора.
  // Эта версия строителя гарантирует, что при сбросе формы (.reset()) значения не станут null.
  private readonly fb = inject(NonNullableFormBuilder);

  // Декларативное конструирование строго типизированной формы.
  // Синтаксис: [значение_по_умолчанию, [валидаторы]]
  readonly authForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  onFormSubmit(): void {
    if (this.authForm.invalid) {
      return;
    }

    // Извлечение полностью типизированного объекта значений формы
    const formPayload = this.authForm.getRawValue();
    console.log('Полезная нагрузка формы готова к отправке:', formPayload);
  }
}
```

#### 2. Файл разметки: `auth-form.html`
```html
<!-- Связываем HTML-тег с объектом нашей формы через директиву formGroup -->
<form [formGroup]="authForm" (ngSubmit)="onFormSubmit()" class="form-container">
  
  <div class="field-group">
    <label for="email">Электронная почта:</label>
    <!-- Связываем конкретный инпут с контролом через formControlName -->
    <input id="email" type="email" formControlName="email" class="form-input">
  </div>

  <div class="field-group">
    <label for="password">Пароль:</label>
    <input id="password" type="password" formControlName="password" class="form-input">
  </div>

  <!-- Кнопка автоматически блокируется, если валидация полей не пройдена -->
  <button type="submit" [disabled]="authForm.invalid" class="btn-submit">
    Отправить данные
  </button>
  
</form>
```

#### 3. Файл стилей: `auth-form.css`
```css
/* Контейнер формы с ограничением максимальной ширины */
.form-container {
  max-width: 400px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

/* Группа полей с вертикальным распределением элементов */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

/* Стилизация полей ввода под темную и светлую тему */
.form-input {
  padding: 8px 12px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

/* Акцентирование фокуса ввода */
.form-input:focus {
  border-color: var(--accent);
}

/* Стилизация кнопки отправки формы */
.btn-submit {
  background-color: var(--accent);
  color: white;
  border: none;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  width: 100%;
}

/* Снижение непрозрачности и отключение курсора у заблокированной кнопки */
.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

### Шаблон 2: Сложная форма с динамическим массивом полей (FormArray)
*   **Назначение:** Реализация формы конфигурации с динамическим добавлением и удалением полей (например, список ссылок или адресов) во внешних файлах на основе `FormArray`.

#### 1. Файл логики: `dynamic-links-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, FormArray, Validators } from '@angular/forms';

@Component({
  selector: 'app-dynamic-links-form',
  imports: [ReactiveFormsModule],
  templateUrl: './dynamic-links-form.html',
  styleUrl: './dynamic-links-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DynamicLinksForm { // Имя класса не содержит суффикса Component
  private readonly fb = inject(NonNullableFormBuilder);

  // Инициализация формы, содержащей в себе изначально пустой массив FormArray
  readonly configForm = this.fb.group({
    links: this.fb.array<string>([])
  });

  // Удобный строго типизированный геттер для извлечения FormArray из структуры формы.
  // Позволяет избежать постоянного приведения типов и кастов AbstractControl в HTML-шаблоне.
  get linksArray(): FormArray {
    return this.configForm.controls.links;
  }

  // Динамическое добавление нового контрола в массив
  addLinkField(): void {
    // Создаем новый строго типизированный контрол с валидацией ссылки
    const newControl = this.fb.control('', [Validators.required, Validators.pattern(/https?:\/\/.+/)]);
    this.linksArray.push(newControl);
  }

  // Удаление контрола из массива по его порядковому индексу
  removeLinkField(index: number): void {
    this.linksArray.removeAt(index);
  }

  saveConfig(): void {
    if (this.configForm.invalid) {
      return;
    }
    console.log('Конфигурация ссылок успешно сохранена:', this.configForm.getRawValue());
  }
}
```

#### 2. Файл разметки: `dynamic-links-form.html`
```html
<div class="config-wrapper">
  <h3>Настройка внешних ссылок</h3>

  <form [formGroup]="configForm" class="form-structure">
    
    <!-- 
      Инициализация зоны массива полей. 
      Директива formArrayName связывает контейнер с нашим FormArray в классе.
    -->
    <div formArrayName="links" class="array-container">
      
      <!-- Итерируемся по списку контролов внутри FormArray -->
      @for (linkControl of linksArray.controls; track linkControl; let idx = $index) {
        <!-- 
          Каждый контроллер в массиве связывается по своему числовому индексу.
          Используем форму синтаксиса [formControlName]="idx" для явного сопоставления.
        -->
        <div class="array-item">
          <input type="url" [formControlName]="idx" placeholder="https://example.com" class="array-input">
          <button type="button" (click)="removeLinkField(idx)" class="btn-delete">Удалить</button>
        </div>
      } @empty {
        <!-- Блок отображается, если в массиве нет ни одного элемента -->
        <div class="empty-array">Список ссылок пуст. Добавьте хотя бы одну ссылку.</div>
      }
      
    </div>

    <div class="actions">
      <button type="button" (click)="addLinkField()" class="btn-add">Добавить поле</button>
      <button type="button" (click)="saveConfig()" [disabled]="configForm.invalid" class="btn-save">Сохранить</button>
    </div>
    
  </form>
</div>
```

#### 3. Файл стилей: `dynamic-links-form.css`
```css
/* Внешняя обертка конфигурационного блока */
.config-wrapper {
  max-width: 500px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

/* Контейнер списка динамического массива с вертикальным распределением */
.array-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 15px;
}

/* Строка элемента массива */
.array-item {
  display: flex;
  gap: 10px;
}

/* Инпут ввода внутри строки */
.array-input {
  flex: 1;
  padding: 8px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

.array-input:focus {
  border-color: var(--accent);
}

/* Кнопка удаления элемента */
.btn-delete {
  background: none;
  border: 1px solid var(--error-text);
  color: var(--error-text);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}

/* Кнопка добавления нового элемента */
.btn-add {
  background: none;
  border: 1px solid var(--accent);
  color: var(--accent);
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

/* Кнопка отправки конфигурации */
.btn-save {
  background-color: var(--accent);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Оформление заглушки пустого массива */
.empty-array {
  text-align: center;
  padding: 20px;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
  color: var(--text-muted);
}

/* Контейнер панели действий */
.actions {
  display: flex;
  gap: 10px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектура строгой типизации в реактивных формах
До версии Angular 14 реактивные формы не имели строгой типизации. Любой вызов `form.value` возвращал тип `any`, что приводило к частым ошибкам времени выполнения, когда разработчик опечатывался в названии поля или пытался прочитать отсутствующее свойство.

Начиная с Angular 14, все реактивные формы по умолчанию являются строго типизированными:
*   При вызове `this.fb.group({ email: '' })` Angular автоматически выводит тип возвращаемого объекта как `FormGroup<{ email: FormControl<string> }>`.
*   Попытка прочитать свойство, которого нет в конфигурации строителя (например, `this.configForm.controls.notExist`), приведет к ошибке компиляции TypeScript.
*   Метод `form.getRawValue()` возвращает строго типизированный плоский объект на основе объявленных типов контролов, полностью исключая `any` из сетевой полезной нагрузки.

### 2. Защита от сброса значений в null: Роль `NonNullableFormBuilder`
В стандартном `FormBuilder` при вызове метода `.reset()` на форме все её контролы сбрасывают свои текущие значения в системное значение `null`. Из-за этого TypeScript вынужден выводить тип каждого поля как допускающий `null` (например, `FormControl<string | null>`). Разработчику приходилось писать постоянные проверки «на всякий случай» в коде.

Чтобы решить эту проблему, Angular предоставляет службу `NonNullableFormBuilder` (или свойство `fb.nonNullable` у стандартного строителя). Когда вы используете `NonNullableFormBuilder`:
1.  Контролы создаются со специальным флагом `{ nonNullable: true }` под капотом.
2.  При вызове `form.reset()` значения контролов сбрасываются не в `null`, а к их **исходным дефолтным значениям**, указанным при инициализации (например, к пустой строке `''`).
3.  TypeScript выводит чистый тип поля без `null` (например, `FormControl<string>`), что значительно упрощает обработку данных.

### 3. Пошаговый разбор фаз сборки формы во внешних файлах
При создании инстанса компонента `AuthForm`:
1.  **Разрешение DI-зависимости:** Рантайм находит и внедряет службу `NonNullableFormBuilder` в класс компонента.
2.  **Построение модели дерева формы:** Выполняется метод `fb.group()`. Angular последовательно обходит переданный объект конфигурации, создает для каждого поля экземпляр `FormControl` с установкой начальных значений и навешивает переданные функции-валидаторы.
3.  **Асинхронная загрузка шаблона и стилей:** В ходе JIT/AOT-компиляции Angular считывает пути, указанные в свойствах `templateUrl` и `styleUrl`, сопоставляя разметку HTML и стили CSS с JS-кодом компонента.
4.  **Связывание шаблона (Data Binding):** Директива `formGroup` считывает созданную модель и сопоставляет её с HTML-элементом `form`. Директивы `formControlName` находят соответствующие инпуты во внешнем файле HTML и настраивают двунаправленный мост передачи событий (value changes) и синхронизацию CSS-классов валидности (таких как `ng-invalid`, `ng-dirty`).

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Использование небезопасных методов `.setValue()` вместо `.patchValue()` при частичном обновлении формы**
    *   *Симптомы:* Приложение аварийно завершает работу с ошибкой в консоли: `Error: Must supply a value for form control with name: ...`.
    *   *Физика процесса:* Метод `.setValue()` требует передачи объекта, структура которого **абсолютно идентична** структуре формы. Если в объекте будет отсутствовать хотя бы одно поле (например, при попытке обновить только email), Angular сгенерирует критическую ошибку.
    *   *Решение:* Использовать метод `.patchValue()`, который безопасно обновляет только переданные поля, игнорируя отсутствующие.

```typescript
// ОШИБКА: Вызовет краш, если в объекте нет поля 'password'
updateProfile(): void {
  this.authForm.setValue({ email: 'new@example.com' }); 
}

// ИСПРАВЛЕНИЕ: Безопасное частичное обновление через patchValue
updateProfileCorrectly(): void {
  this.authForm.patchValue({ email: 'new@example.com' });
}
```

*   **Ошибка 2: Прямая мутация значений формы в обход реактивных методов (нарушение реактивного контракта)**
    *   *Симптомы:* Значения полей визуально изменились в переменной в классе, но инпуты на экране не перерисовались; валидаторы не перепроверили данные; состояние формы рассинхронизировалось.
    *   *Физика процесса:* Прямое изменение значений полей объекта формы (например, `this.authForm.value.email = 'test'`) мутирует данные по ссылке, но не запускает цепочку внутренних событий (Value Changes) реактивных форм Angular.
    *   *Решение:* Обновлять значения контролов исключительно через методы `.setValue()`, `.patchValue()` или вызывать метод `.setValue()` на конкретном контроле `form.controls.email.setValue(...)`.

```typescript
// ОШИБКА: Прямое изменение значения объекта не запустит реактивные события
hackFormValue(): void {
  this.authForm.value.email = 'hack@example.com';
}

// ИСПРАВЛЕНИЕ: Использование штатного метода обновления реактивного контрола
updateFormValueReactive(): void {
  this.authForm.controls.email.setValue('hack@example.com');
}
```

*   **Ошибка 3: Потеря типизации и необходимость кастов при динамическом добавлении контролов в `FormArray` без указания типов**
    *   *Симптомы:* Компилятор TypeScript ругается на тип `AbstractControl` при попытке прочитать свойства элементов массива в шаблоне; приходится писать постоянные приведения типов (`as FormControl`) в HTML-разметке.
    *   *Физика процесса:* По умолчанию без явного generic-указания типов метод `fb.array([])` создает нетипизированный массив контролов, возвращая базовый тип `AbstractControl<any, any>[]`.
    *   *Решение:* Всегда явно указывать тип элементов при инициализации массива в строителе — `this.fb.array<string>([])` или `this.fb.array<FormGroup>(...)`.

```typescript
// ОШИБКА: Массив будет содержать нетипизированные AbstractControl
readonly badForm = this.fb.group({
  tags: this.fb.array([])
});

// ИСПРАВЛЕНИЕ: Явная строгая типизация массива строк
readonly goodForm = this.fb.group({
  tags: this.fb.array<string>([])
});
```