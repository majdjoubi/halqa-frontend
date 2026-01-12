import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-teacher-instructions',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './teacher-instructions.component.html',
  styleUrls: ['./teacher-instructions.component.scss'],
})
export class TeacherInstructionsComponent {}
