CREATE DATABASE IF NOT EXISTS TaskManagement;
USE TaskManagement;

-- Users 
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  level INT NOT NULL DEFAULT 1,
  xp INT NOT NULL DEFAULT 0,
  tasks_completed INT NOT NULL DEFAULT 0,
  streak_days INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Folders
CREATE TABLE IF NOT EXISTS folders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Tasks 
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folder_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  due_date DATE,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status ENUM('next','in-progress','later') NOT NULL DEFAULT 'next',
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Distracting applications
CREATE TABLE IF NOT EXISTS distracting_apps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Application usage
CREATE TABLE IF NOT EXISTS app_usage_totals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  app_name VARCHAR(255) NOT NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY (user_id, app_name)
);

-- Leaderboard 
CREATE TABLE IF NOT EXISTS leaderboard (
  user_id INT PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  level INT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Focus sessions
CREATE TABLE IF NOT EXISTS focus_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  session_date DATE NOT NULL,
  total_seconds INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY(user_id, session_date)
);

DELIMITER $$

-- Stored Procedures

-- Adds XP to a user and levels them up if necessary
CREATE PROCEDURE proc_add_xp(IN p_user_id INT, IN p_xp INT)
BEGIN
  DECLARE cur_xp INT;
  DECLARE cur_lvl INT;
  DECLARE threshold INT DEFAULT 100;
  DECLARE new_xp INT;
  SELECT xp, level INTO cur_xp, cur_lvl FROM users WHERE id = p_user_id;
  SET new_xp = cur_xp + p_xp;
  WHILE new_xp >= threshold DO
    SET new_xp = new_xp - threshold;
    SET cur_lvl = cur_lvl + 1;
  END WHILE;
  UPDATE users
    SET xp = new_xp,
        level = cur_lvl
    WHERE id = p_user_id;
END$$

-- Marks a task as completed and awards XP before deleting it
CREATE PROCEDURE proc_complete_task(IN p_task_id INT)
BEGIN
  DECLARE f_id     INT;
  DECLARE u_id     INT;
  DECLARE xp_gain  INT DEFAULT 20;

  SELECT folder_id
    INTO f_id
    FROM tasks
   WHERE id = p_task_id;

  SELECT user_id
    INTO u_id
    FROM folders
   WHERE id = f_id;

  CALL proc_add_xp(u_id, xp_gain);
  UPDATE users
     SET tasks_completed = tasks_completed + 1
   WHERE id = u_id;

  DELETE FROM tasks
   WHERE id = p_task_id;
END$$

-- Records focus seconds for today and updates user total
CREATE PROCEDURE proc_add_focus(IN p_user_id INT, IN p_seconds INT)
BEGIN
  INSERT INTO focus_sessions(user_id, session_date, total_seconds)
    VALUES(p_user_id, CURDATE(), p_seconds)
    ON DUPLICATE KEY
    UPDATE total_seconds = total_seconds + p_seconds;

END$$

-- FOLDER MANAGEMENT

-- Creates a folder
CREATE PROCEDURE proc_create_folder(IN p_user_id INT, IN p_name VARCHAR(255))
BEGIN
  INSERT INTO folders(user_id, name) VALUES(p_user_id, p_name);
END$$

-- Lists folders for a user 
CREATE PROCEDURE proc_get_folders(IN p_user_id INT)
BEGIN
  SELECT * FROM folders WHERE user_id = p_user_id;
END$$

-- Updates folder name
CREATE PROCEDURE proc_update_folder(IN p_folder_id INT, IN p_name VARCHAR(255))
BEGIN
  UPDATE folders SET name = p_name WHERE id = p_folder_id;
END$$

CREATE PROCEDURE proc_delete_folder(IN p_folder_id INT)
BEGIN
  DELETE FROM folders WHERE id = p_folder_id;
END$$

-- Gets user's stats
CREATE PROCEDURE proc_get_user_stats(IN p_user_id INT)
BEGIN
  SELECT level, xp, tasks_completed, streak_days
    FROM users
   WHERE id = p_user_id;
END$$

-- Updates user's streak days
CREATE PROCEDURE proc_update_streak_days(
  IN p_user_id INT,
  IN p_streak INT
)
BEGIN
  UPDATE users
     SET streak_days = p_streak
   WHERE id = p_user_id;
END$$

-- TASK MANAGEMENT

-- Creates a task
CREATE PROCEDURE proc_create_task(
  IN p_folder_id INT,
  IN p_title VARCHAR(255),
  IN p_due DATE,
  IN p_pri ENUM('low','medium','high'),
  IN p_stat ENUM('next','in-progress','later')
)
BEGIN
  INSERT INTO tasks(folder_id, title, completed, due_date, priority, status)
    VALUES(p_folder_id, p_title, FALSE, p_due, p_pri, p_stat);
END$$

-- Returns tasks for a given user
CREATE PROCEDURE proc_get_tasks_for_user(IN p_user_id INT)
BEGIN
  SELECT t.*
    FROM tasks t
    JOIN folders f ON t.folder_id = f.id
    WHERE f.user_id = p_user_id;
END$$

-- Adds a distracting app for a user
CREATE PROCEDURE proc_add_distracting_app(IN p_user_id INT, IN p_app VARCHAR(255))
BEGIN
  INSERT IGNORE INTO distracting_apps(user_id, app_name)
    VALUES(p_user_id, p_app);
END$$

-- Returns distracting apps for a user
CREATE PROCEDURE proc_get_distracting_apps(IN p_user_id INT)
BEGIN
  SELECT * FROM distracting_apps WHERE user_id = p_user_id;
END$$

-- Removes a distracting app for a user
CREATE PROCEDURE proc_remove_distracting_app(IN p_user_id INT, IN p_app VARCHAR(255))
BEGIN
  DELETE FROM distracting_apps
    WHERE user_id = p_user_id AND app_name = p_app;
END$$

-- Adds app usage time for a user
CREATE PROCEDURE proc_add_app_usage(IN p_user_id INT, IN p_app VARCHAR(255), IN p_seconds INT)
BEGIN
  INSERT INTO app_usage_totals(user_id, app_name, total_seconds)
    VALUES(p_user_id, p_app, p_seconds)
    ON DUPLICATE KEY
    UPDATE total_seconds = total_seconds + p_seconds;
END$$

-- Returns app usage time for a user
CREATE PROCEDURE proc_get_app_usage(IN p_user_id INT)
BEGIN
  SELECT * FROM app_usage_totals WHERE user_id = p_user_id;
END$$


-- Updates leaderboard data for all users
CREATE PROCEDURE proc_refresh_leaderboard()
BEGIN
  TRUNCATE TABLE leaderboard;
  INSERT INTO leaderboard(user_id, username, level)
    SELECT id, username, level FROM users;
END$$

DELIMITER ;
