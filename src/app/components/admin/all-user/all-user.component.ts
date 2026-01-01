import { Component, OnInit, Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RepoService } from '../../../Repositories/repo.service';
import { ShowUsersComponent } from '../../../shared/AdminComponent/show-users/show-users.component';

// Custom pipe for filtering users by role in template
@Pipe({
  name: 'filterByRole',
  standalone: true,
})
export class FilterByRolePipe implements PipeTransform {
  transform(users: any[], role: string): any[] {
    if (!users || role === 'all') return users;
    return users.filter((u) => {
      if (role === 'teacher') {
        return u.role === 2 || u.role === 'teacher';
      }
      if (role === 'student') {
        return u.role === 1 || u.role === 'student';
      }
      return true;
    });
  }
}

@Component({
  selector: 'app-all-user',
  standalone: true,
  imports: [ShowUsersComponent, FormsModule, CommonModule, FilterByRolePipe],
  templateUrl: './all-user.component.html',
  styleUrls: ['./all-user.component.scss'],
})
export class AllUserComponent implements OnInit {
  constructor(private repoService: RepoService) {}

  AllUsers: any[] = [];
  // keep a readonly reference so the imported standalone component is treated as used
  readonly _showUsersComp = ShowUsersComponent;

  // configure action buttons: Deactivate and Delete
  switchButtons = [
    {
      label: 'Deactivate',
      bg: '#dc3545',
      action: 'deactivate',
    },
    {
      label: 'Delete',
      bg: '#6c757d',
      action: 'delete',
    },
  ];

  ngOnInit(): void {
    this.repoService.getAllUsers().subscribe((users) => {
      // Note: The /api/admin/users endpoint does not return profile pictures
      // Backend needs to be updated to include profilePictureUrl field
      this.AllUsers = users || [];
    });
  }

  // Role filter method
  filterByRole(role: string) {
    this.selectedRoleFilter = role;
  }

  // Get filtered users by role for passing to child component
  get usersFilteredByRole() {
    if (this.selectedRoleFilter === 'all') {
      return this.AllUsers;
    }
    return (this.AllUsers || []).filter((u) => {
      const userRole = u.role;
      if (this.selectedRoleFilter === 'teacher') {
        return userRole === 2 || userRole === 'teacher';
      }
      if (this.selectedRoleFilter === 'student') {
        return userRole === 1 || userRole === 'student';
      }
      return true;
    });
  }

  // status options to pass to the shared show-users component
  statusOptions = [
    { key: 'approved', label: 'Active', color: '#0b8043', checked: true },
    { key: 'pending', label: 'Inactive', color: '#c30000', checked: true },
  ];

  // role filter options
  roleOptions = [
    { key: 'all', label: 'All Users', checked: true },
    { key: 'teacher', label: 'Teachers', checked: false },
    { key: 'student', label: 'Students', checked: false },
  ];

  // current role filter
  selectedRoleFilter = 'all';

  // mapFn to normalize incoming user objects that have `isActive` into the shape
  // expected by show-users (statusKey/statusLabel etc). This keeps the shared
  // component unchanged while adapting to this endpoint's schema.
  userMapFn = (item: any) => {
    const firstName = item.firstName || item.first_name || '';
    const lastName = item.lastName || item.last_name || '';
    const displayName =
      firstName || lastName
        ? (firstName + ' ' + lastName).trim()
        : item.email || item.userName || item.username || 'Unknown';
    const isActive = !!item.isActive;
    const isToggling = !!item.__toggling; // internal transient flag set by parent
    // when toggling, expose a loading status so the child renders a loading class
    const statusKey = isToggling
      ? 'loading'
      : isActive
      ? 'approved'
      : 'pending';
    const statusLabel = isToggling
      ? 'Updating...'
      : isActive
      ? 'Active'
      : 'Inactive';
    
    // Handle profile picture from various sources
    let profilePic = item.profilePictureUrl || 
                     item.profilePicture || 
                     item.profile ||  // This is used in pending-teachers
                     item.avatar || 
                     item.avatarUrl ||
                     item.image ||
                     item.photo ||
                     item.picture ||
                     item.imageUrl ||
                     item.photoUrl ||
                     (item.user && item.user.profilePictureUrl) ||
                     (item.user && item.user.profile) ||
                     (item.user && item.user.avatar);
    
    // If profile picture is a relative path, ensure it works
    if (profilePic && !profilePic.startsWith('http') && !profilePic.startsWith('/')) {
      profilePic = '/' + profilePic;
    }
    
    // Default fallback
    if (!profilePic) {
      profilePic = '/assets/images/blank-avatar.webp';
    }

    // Determine role label
    let roleLabel = '';
    const roleVal = item.role;
    if (typeof roleVal === 'number') {
      roleLabel = roleVal === 2 ? 'Teacher' : roleVal === 1 ? 'Student' : roleVal === 0 ? 'Admin' : 'User';
    } else if (typeof roleVal === 'string') {
      roleLabel = roleVal.charAt(0).toUpperCase() + roleVal.slice(1).toLowerCase();
    }

    return {
      raw: item,
      id: item.id || item._id || item.userId,
      firstName,
      lastName,
      name: displayName,
      displayName,
      profilePictureUrl: profilePic,
      role: roleLabel,
      specializations: item.specializations || item.subjects || [],
      totalStudents: item.totalStudents || 0,
      averageRating: item.averageRating || '-',
      hourlyRate: item.hourlyRate || 0,
      email: item.email || '',
      status: isActive ? 'active' : 'inactive',
      statusKey,
      statusLabel,
      statusCode: isActive ? 2 : 1,
    };
  };

  // handle actions emitted from the show-users component
  handleAction(evt: { action: string; user: any }) {
    if (!evt || !evt.action) return;
    
    if (evt.action === 'deactivate') {
      // Handle deactivate action - set user as inactive
      const id = evt.user?.id || evt.user?._id || evt.user?.userId;
      if (!id) return;
      
      if (confirm('هل أنت متأكد من إلغاء تفعيل هذا المستخدم؟\nAre you sure you want to deactivate this user?')) {
        this.repoService.toggleUserStatus(id, false).subscribe({
          next: () => {
            // Update user in list
            this.AllUsers = (this.AllUsers || []).map((u) => {
              const uid = u.id || u._id || u.userId;
              if (String(uid) !== String(id)) return u;
              return { ...u, isActive: false };
            });
            alert('تم إلغاء تفعيل المستخدم بنجاح\nUser deactivated successfully');
          },
          error: (err) => {
            console.error('Failed to deactivate user', err);
            alert('فشل في إلغاء تفعيل المستخدم\nFailed to deactivate user. Please try again.');
          },
        });
      }
    } else if (evt.action === 'delete') {
      // Handle delete action - remove user completely from database
      const id = evt.user?.id || evt.user?._id || evt.user?.userId;
      if (!id) return;
      
      if (confirm('⚠️ تحذير: هل أنت متأكد من حذف هذا المستخدم نهائياً؟ سيتم حذف جميع بياناته بما في ذلك الحجوزات والدروس والتقييمات.\n\n⚠️ Warning: Are you sure you want to permanently delete this user? All their data including bookings, lessons, and reviews will be deleted.')) {
        this.repoService.deleteUser(id).subscribe({
          next: () => {
            // Remove user from list
            this.AllUsers = (this.AllUsers || []).filter((u) => {
              const uid = u.id || u._id || u.userId;
              return String(uid) !== String(id);
            });
            alert('تم حذف المستخدم بنجاح\nUser deleted successfully');
          },
          error: (err) => {
            console.error('Failed to delete user', err);
            alert('فشل في حذف المستخدم\nFailed to delete user. Please try again.');
          },
        });
      }
    } else {
      // forward other actions to console for now
      console.log('AllUser action', evt);
    }
  }
}
