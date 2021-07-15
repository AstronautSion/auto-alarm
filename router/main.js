module.exports = function(app, fs, botEvent)
{
     app.get('/',function(req,res){
         res.render('index', {
             botEvent: botEvent,
         })
     });
}