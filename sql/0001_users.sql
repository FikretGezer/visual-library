-- Visual Library: kullanici tablosu (RPA_DB, yeni sema).
-- Bu dosya tekrar calistirilabilir: nesneler yoksa olusturulur, mevcut veriye dokunmaz.
-- Yalnizca visuallibrary semasindaki nesneleri yaratir.

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'visuallibrary')
  EXEC('CREATE SCHEMA visuallibrary');

IF NOT EXISTS (
  SELECT 1 FROM sys.tables t
  JOIN sys.schemas s ON s.schema_id = t.schema_id
  WHERE s.name = 'visuallibrary' AND t.name = 'users'
)
CREATE TABLE visuallibrary.users (
  id            bigint         IDENTITY(1,1) NOT NULL PRIMARY KEY,
  email         nvarchar(320)  NOT NULL,
  display_name  nvarchar(200)  NULL,
  role          nvarchar(10)   NOT NULL CONSTRAINT DF_vl_users_role DEFAULT 'user',
  is_active     bit            NOT NULL CONSTRAINT DF_vl_users_active DEFAULT 1,
  created_at    datetime2(3)   NOT NULL CONSTRAINT DF_vl_users_created DEFAULT SYSUTCDATETIME(),
  created_by    nvarchar(320)  NULL,
  last_login_at datetime2(3)   NULL,
  CONSTRAINT UQ_vl_users_email UNIQUE (email),
  CONSTRAINT CK_vl_users_role CHECK (role IN ('admin','user'))
);
