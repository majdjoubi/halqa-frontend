import { Component } from '@angular/core';
import { ShowUsersComponent } from '../../../shared/AdminComponent/show-users/show-users.component';
import { RepoService } from '../../../Repositories/repo.service';
import { CommonModule } from '@angular/common';
import { SideMenuComponent } from '../../../shared/shared-component/side-menu/side-menu.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pending-teachers',
  standalone: true,
  imports: [
    CommonModule,
    ShowUsersComponent,
    SideMenuComponent,
    TranslateModule,
  ],
  templateUrl: './pending-teachers.component.html',
  styleUrl: './pending-teachers.component.scss',
  // Removed invalid empty click expression
})
export class PendingTeachersComponent {
  // pending teachers array - fill this from your service or parent as needed
  pendingTeachers: any[] = [];
  teacherById: any = null;
  sidebarOpen = false;
  loadingViewId: string | null = null;
  constructor(private repoService: RepoService) {}

  // Example: you can populate pendingTeachers in ngOnInit by calling a service.
  ngOnInit() {
    this.repoService.getAllPendingTeachers().subscribe((data) => {
      this.pendingTeachers = (data || []).map((item: any) =>
        this.mapPendingItem(item)
      );
    });
  }

  // reference to ensure the imported ShowUsersComponent is treated as used by linters
  readonly _showUsersComp = ShowUsersComponent;
  // optional refresh method for the empty-state button
  refreshPending() {
    this.refreshList();
  }

  // handle actions emitted by show-users component
  onUserAction(event: { action: string; user: any }) {
    const { action, user } = event;
    console.log('received action', action, user);
    if (action === 'allow') {
      // set status to 2 (approved) using patchStatus helper
      const id = user?.id || user;
      if (!id) {
        console.warn('no id available for allow action', user);
        return;
      }
      this.patchStatus(id, 2);
    }

    if (action === 'remove') {
      const id = user?.id || user;
      if (!id) {
        console.warn('no id available for remove action', user);
        return;
      }
      // set status to 3 (rejected)
      this.patchStatus(id, 3);
    }

    if (action === 'view') {
      const id = user?.id || user;
      if (!id) {
        console.warn('no id available for view action', user);
        return;
      }
      this.viewTeacherProfile(id);
    }
  }

  viewTeacherProfile(teacherId: string) {
    // fetch teacher profile and open side menu on success
    this.repoService.getUserById(teacherId).subscribe(
      (response: any) => {
        this.teacherById = response;
        console.log('Teacher Profile:', response);
        // open the side-menu
        this.sidebarOpen = true;
      },
      (err) => {
        console.error('Failed to load teacher profile', err);
      }
    );
  }

  allowTeacher(teacherId: string) {
    this.patchStatus(teacherId, 2);
    this.sidebarOpen = false;
  }

  rejectTeacher(teacherId: string) {
    this.patchStatus(teacherId, 3);
    this.sidebarOpen = false;
  }

  private refreshList() {
    this.repoService.getAllPendingTeachers().subscribe((data) => {
      this.pendingTeachers = (data || []).map((item: any) =>
        this.mapPendingItem(item)
      );
    });
  }

  private mapPendingItem(item: any) {
    // Normalize the API response into the shape ShowUsers expects.
    const user = item.user || item;
    return {
      id: item.id || user.id || user.userId || user._id,
      firstName: user.firstName || user.name || '',
      lastName: user.lastName || '',
      // prefer an explicit displayName, otherwise build one or fallback to email
      displayName:
        item.displayName ||
        item.fullName ||
        user.displayName ||
        user.fullName ||
        user.name ||
        ((user.firstName || '') + ' ' + (user.lastName || '')).trim() ||
        user.email ||
        'Unknown',
      profilePictureUrl:
        user.profilePictureUrl || user.avatar || user.profile || '/assets/images/blank-avatar.webp',
      email: user.email || '',
      role: item.role || user.role || 'teacher',
      specializations: item.specializations || user.specializations || [],
      totalStudents: item.totalStudents || user.totalStudents || 0,
      averageRating: item.averageRating || user.averageRating || 0,
      hourlyRate: item.hourlyRate || user.hourlyRate || 0,
      status: (item.status || item.state || user.status || 'pending')
        .toString()
        .toLowerCase(),
    };
  }

  patchStatus(id: string, status: number) {
    if (this.repoService && (this.repoService as any).approveTeacher) {
      (this.repoService as any).approveTeacher(id, status).subscribe({
        next: () => {
          console.log(`status updated for ${id} -> ${status}`);
          this.refreshList();
          this.sidebarOpen = false; // close the side menu after action
        },
        error: (err: any) => {
          console.error('failed to patch status', err);
        },
      });
    } else {
      console.warn('approveTeacher not implemented on repoService');
    }
  }
}
