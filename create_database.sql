CREATE DATABASE IF NOT EXISTS TaskManagement;
USE TaskManagement;

-- Users 
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  total_focus_mins INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  streak_days INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Folders
CREATE TABLE folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tasks 
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folder_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('next','in-progress','later') NOT NULL DEFAULT 'next',
  xp_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Distracting applications
CREATE TABLE distracting_apps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Application usage 
CREATE TABLE app_usage_totals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  total_minutes INT NOT NULL DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, app_name)
);

-- Leaderboard 
CREATE TABLE leaderboard (
  user_id INT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  level INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);