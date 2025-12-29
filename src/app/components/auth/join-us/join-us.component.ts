import { Component } from '@angular/core';
import { SideImageComponent } from '../../../shared/shared-component/side-image/side-image.component';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-join-us',
  standalone: true,
  imports: [SideImageComponent, TranslateModule, RouterModule],
  templateUrl: './join-us.component.html',
  styleUrl: './join-us.component.scss',
})
export class JoinUsComponent {}
