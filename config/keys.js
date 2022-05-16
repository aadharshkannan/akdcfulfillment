const req = require("express/lib/request");

if(process.env.NODE_ENV=="production")
{
  exports.creds = require('./prod');
}
else
{
  exports.creds = require('./dev');
}