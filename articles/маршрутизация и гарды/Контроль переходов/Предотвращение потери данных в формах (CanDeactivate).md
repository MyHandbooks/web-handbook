---
tags: [angular, роутинг, гарды, формы]
related: ["[[Функциональный гард доступа (CanActivate).md]]", "[[Объявление структуры формы через FormBuilder.md]]"]
status: "completed"
---

# Предотвращение потери данных в формах (CanDeactivate)

## БЫСТРЫЙ СТАРТ

*   **Гард `CanDeactivateFn`** — это функциональный защитник выхода с маршрута. Он вызывается роутером, когда пользователь пытается покинуть текущую страницу (перейти на другой URL-адрес внутри приложения), и позволяет заблокировать переход, если на странице остались несохраненные данные.
*   **Ссылка на компонент:** В отличие от гардов доступа, `CanDeactivateFn` в качестве первого аргумента автоматически получает прямую ссылку на инстанс активного компонента, что позволяет считывать его внутреннее состояние (например, статус чистоты реактивной формы `form.dirty`).
*   **Возвращаемые значения:** Функция-гард должна возвращать `boolean` (разрешить уход или остаться на странице) или реактивный поток `Observable<boolean>` / `Promise<boolean>` для обработки кастомных диалоговых окон.
*   **Используйте:** Для всех экранов с формами ввода (профиль, создание статьи, оформление заказа, настройки), чтобы предотвратить случайную потерю набранного пользователем текста при случайном клике по элементам меню.
*   **Не используйте:** Для фонового автосохранения данных перед уходом (для этой цели лучше подходит реактивная подписка на `valueChanges` или ручной вызов метода сохранения в компоненте).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Универсальный интерфейсный гард несохраненных изменений (unsaved-changes.guard.ts)
*   **Назначение:** Описание обобщенного (generic) функционального гарда, который работает с любым компонентом, реализующим строгий интерфейс проверки изменений.

#### 1. Файл интерфейса и гарда: `unsaved-changes.guard.ts`
```typescript
import { CanDeactivateFn } from '@angular/router';

// Объявляем контракт (интерфейс), который должен реализовать любой защищаемый компонент
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

// Описываем типизированный функциональный гард
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component): boolean => {
  // Если у компонента есть несохраненные изменения
  if (component.hasUnsavedChanges()) {
    // Выводим стандартное браузерное окно подтверждения
    return confirm('У вас есть несохраненные изменения. Вы действительно хотите покинуть страницу?');
  }
  
  // Разрешаем беспрепятственный переход
  return true;
};
```

#### 2. Файл конфигурации маршрутов: `app.routes.ts`
```typescript
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from './guards/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: 'edit-profile',
    // Подключаем гард деактивации к маршруту редактирования
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () => import('./features/edit-profile/edit-profile').then(m => m.EditProfile)
  }
];
```

---

### Шаблон 2: Компонент реактивной формы с реализацией защиты (edit-profile.ts)
*   **Назначение:** Компонент формы редактирования профиля реализует интерфейс `HasUnsavedChanges`, анализируя состояние реактивной формы.

#### 1. Файл логики компонента: `edit-profile.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';

@Component({
  selector: 'app-edit-profile',
  imports: [ReactiveFormsModule], // Импортируем только нужный модуль для работы с формами
  templateUrl: './edit-profile.html',
  styleUrl: './edit-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditProfile implements OnInit, HasUnsavedChanges {
  private readonly fb = inject(NonNullableFormBuilder);

  // Объявляем реактивную форму
  public readonly profileForm = this.fb.group({
    username: [''],
    bio: ['']
  });

  // Флаг, указывающий, что данные были успешно отправлены на сервер
  private isSaved = false;

  public ngOnInit(): void {
    // Эмулируем загрузку дефолтных данных
    this.profileForm.setValue({
      username: 'константин',
      bio: 'фронтенд-разработчик'
    });
  }

  // Реализуем метод интерфейса HasUnsavedChanges
  public hasUnsavedChanges(): boolean {
    // Если форма была изменена пользователем (dirty) и данные не сохранены
    return this.profileForm.dirty && !this.isSaved;
  }

  public onSubmit(): void {
    if (this.profileForm.invalid) return;

    console.log('[API] Сохранение данных:', this.profileForm.value);
    
    // Взводим флаг успешного сохранения
    this.isSaved = true;
    
    // Переводим форму в чистое состояние (сбрасываем статус dirty)
    this.profileForm.markAsPristine();
  }
}
```

#### 2. Файл разметки компонента: `edit-profile.html`
```html
<div class="form-wrapper">
  <h3>Редактирование профиля</h3>
  
  <form [formGroup]="profileForm" (ngSubmit)="onSubmit()" class="profile-form">
    <label for="username">Имя пользователя:</label>
    <input id="username" type="text" formControlName="username" />

    <label for="bio">О себе:</label>
    <textarea id="bio" formControlName="bio" rows="4"></textarea>

    <button type="submit" [disabled]="profileForm.pristine || profileForm.invalid">
      Сохранить изменения
    </button>
  </form>
</div>
```

#### 3. Файл стилей компонента: `edit-profile.css`
```css
.form-wrapper {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 500px;
}

.profile-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

input, textarea {
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

button {
  padding: 10px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

### Шаблон 3: Асинхронный гард с кастомным диалоговым окном (custom-deactivate.guard.ts)
*   **Назначение:** Реализация гарда, который вместо стандартного браузерного `confirm` вызывает красивое кастомное модальное окно через асинхронный сервис диалогов.

#### 1. Файл асинхронного гарда: `custom-deactivate.guard.ts`
```typescript
import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable, of } from 'rxjs';
import { DialogService } from '../../services/dialog.service';
import { HasUnsavedChanges } from './unsaved-changes.guard';

export const customDeactivateGuard: CanDeactivateFn<HasUnsavedChanges> = (component): Observable<boolean> => {
  const dialogService = inject(DialogService);

  if (component.hasUnsavedChanges()) {
    // Вызываем кастомный модальный диалог, возвращающий Observable<boolean>
    return dialogService.openConfirmDialog({
      title: 'Несохраненные изменения',
      message: 'Вы уверены, что хотите уйти? Все набранные данные будут потеряны.'
    });
  }

  // Если изменений нет, мгновенно разрешаем переход
  return of(true);
};
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика передачи инстанса компонента в CanDeactivateFn
Механизм вызова `CanDeactivateFn` глубоко интегрирован в цикл смены маршрутов Angular-роутера:

1.  **Триггер перехода:** Пользователь кликает по ссылке перехода на другую страницу приложения.
2.  **Запрос инстанса:** Роутер находит активный в данный момент компонент внутри соответствующей точки монтирования `<router-outlet>`.
3.  **Передача ссылки:** Роутер вызывает объявленный гард `CanDeactivateFn` и передает ссылку на этот инстанс компонента в качестве первого аргумента:
    ```typescript
    // Внутренняя логика роутера
    const isDeactivationAllowed = canDeactivateGuard(activeComponentInstance, currentRoute, currentState, nextState);
    ```
    Благодаря передаче реального объекта компонента, гард получает полный доступ ко всем его публичным свойствам, методам и инжектированным сервисам.

### 2. Защита от закрытия вкладки браузера (beforeunload)
Важный нюанс, который часто упускают разработчики: **`CanDeactivateFn` работает строго внутри SPA-навигации Angular.**

*   **SPA-навигация (Внутренние переходы):** Когда пользователь кликает по ссылкам роутера внутри приложения, `CanDeactivateFn` отрабатывает идеально.
*   **Внешние действия (Закрытие вкладки, перезагрузка страницы, ручной ввод другого адреса в строку браузера):** В этих сценариях Angular полностью выгружается из памяти, и его роутер физически не может остановить браузерный процесс. `CanDeactivateFn` проигнорируется.
*   **Решение:** Для перехвата внешних действий необходимо связать состояние компонента с нативным браузерным событием `beforeunload` через декоратор `@HostListener`.

```typescript
// Интеграция нативного перехватчика в код компонента
import { HostListener } from '@angular/core';

@Component({ ... })
export class EditProfile implements HasUnsavedChanges {
  // ... логика формы

  // Слушаем системное событие закрытия вкладки / перезагрузки страницы в браузере
  @HostListener('window:beforeunload', ['$event'])
  public unloadNotification(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      // Современный браузерный стандарт требует отмены дефолтного поведения
      event.preventDefault();
      // Старый стандарт для совместимости
      event.returnValue = ''; 
    }
  }
}
```

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка компиляции типов при использовании строгого универсального гарда**
    *   *Симптомы:* Проект не собирается, компилятор TypeScript выдает ошибку: `Type 'MyComponent' is not assignable to type 'HasUnsavedChanges'`.
    *   *Физика процесса:* Вы подключили универсальный `unsavedChangesGuard` (Шаблон 1) к маршруту компонента, но сам класс компонента не декларирует реализацию интерфейса `implements HasUnsavedChanges` или в нем отсутствует метод `hasUnsavedChanges()`.
    *   *Решение:* Всегда явно указывайте ключевое слово `implements HasUnsavedChanges` в объявлении класса компонента и реализуйте метод проверки (как показано в Шаблоне 2).

*   **Ошибка 2: Ложное срабатывание гарда при успешной отправке (Submit) формы**
    *   *Симптомы:* Пользователь заполнил форму, нажал кнопку «Сохранить» (данные ушли на сервер), пытается уйти со страницы, но гард все равно блокирует переход и выводит предупреждающий `confirm`.
    *   *Физика процесса:* При вводе данных форма получила статус `dirty` (изменена). Клик на кнопку «Сохранить» отправил данные, но реактивный статус формы остался `dirty: true`, так как Angular-форма не знает, что ее данные были сохранены в БД.
    *   *Решение:* В методе успешной отправки формы обязательно сбрасывайте реактивное состояние чистоты формы, вызывая метод `this.form.markAsPristine()` и переключая флаг сохранения (как показано в Шаблоне 2).

*   **Ошибка 3: Зависание переходов при использовании асинхронных диалогов**
    *   *Симптомы:* Пользователь пытается уйти со страницы, всплывает кастомное модальное окно. Пользователь нажимает «Отмена» или кликает на темный бэкдроп для закрытия окна, модалка исчезает, но навигация в приложении полностью ломается — переходы по любым ссылкам перестают работать.
    *   *Физика процесса:* Кастомный `DialogService` возвращает `Observable<boolean>`, но при закрытии окна кликом на бэкдроп поток не отправляет булево значение (`true`/`false`) и не завершается (`complete`). Роутер Angular зависает в режиме бесконечного ожидания решения от потока, блокируя любые последующие переходы.
    *   *Решение:* Убедитесь, что диалоговый сервис гарантированно отправляет значение `false` и вызывает `complete` у потока при любых сценариях закрытия (нажатие "Esc", клик на крестик, клик на бэкдроп). Для защиты можно принудительно добавить оператор `take(1)` или возвращать дефолтное значение через `defaultIfEmpty(false)` в цепочке гарда.