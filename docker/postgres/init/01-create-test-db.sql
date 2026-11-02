-- Runs once on first container start. A separate database keeps test runs
-- from touching dev data.
CREATE DATABASE kisht_test OWNER kisht;
