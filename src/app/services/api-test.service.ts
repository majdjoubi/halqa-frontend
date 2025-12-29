import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class ApiTestService {
  private base_url = 'https://halqa-api.onrender.com';

  constructor(private http: HttpClient) {}

  // Test API connectivity
  testApiHealth() {
    return this.http.get(`${this.base_url}/api/health`);
  }

  // Test login endpoint with dummy data
  testLoginEndpoint() {
    const testData = {
      email: 'test@example.com',
      password: 'testpassword',
    };

    return this.http.post(`${this.base_url}/api/auth/login`, testData);
  }
}
