# Supabase CA

`supabase-prod-ca-2021.crt` 是公开 CA 证书，不含私钥。

下载地址来自 Supabase 官方 Studio 源码：
https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json

证书地址：https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

连接时同时验证证书链和数据库主机名。证书轮换后需更新此文件或设置 `DATABASE_CA_CERT`。
