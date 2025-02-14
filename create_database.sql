CREATE DATABASE TaskManagement;
USE TaskManagement;

-- User Table
CREATE TABLE user (
    user_ID INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    points INT DEFAULT 0,
    level INT DEFAULT 1
);

-- Folder Table
CREATE TABLE folder (
    folder_ID INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_ID INT,
    FOREIGN KEY (user_ID) REFERENCES user(user_ID) ON DELETE CASCADE
);

-- Task Table
CREATE TABLE task (
    task_ID INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    dueDate DATETIME,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    priority VARCHAR(50) NOT NULL DEFAULT 'Medium',
    folder_ID INT,
    FOREIGN KEY (folder_ID) REFERENCES folder(folder_ID) ON DELETE CASCADE
);

-- Leaderboard Table
CREATE TABLE leaderboard (
    leaderboard_ID INT AUTO_INCREMENT PRIMARY KEY,
    user_ID INT,
    level INT DEFAULT 1,
    points INT DEFAULT 0,
    FOREIGN KEY (user_ID) REFERENCES user(user_ID) ON DELETE CASCADE
);

-- Analytics Table
CREATE TABLE analytics (
    analytics_ID INT AUTO_INCREMENT PRIMARY KEY,
    user_ID INT,
    timeSpent INT DEFAULT 0,
    productivityScore DOUBLE DEFAULT 0.0,
    FOREIGN KEY (user_ID) REFERENCES user(user_ID) ON DELETE CASCADE
);

-- Reward Table
CREATE TABLE reward (
    reward_ID INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    levelRequired INT NOT NULL
);

-- Announcement Table
CREATE TABLE announcement (
    announcement_ID INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    createdBy VARCHAR(255) NOT NULL
);

-- Admin Table
CREATE TABLE admin (
    admin_ID INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
);
