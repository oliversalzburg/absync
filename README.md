absync is a highly opinionated framework to synchronize data pools in MEAN applications.

It consists of:
- a type modeling tool set that builds on top of [mongoose](http://mongoosejs.com/)
- a transactional layer that builds on top of [socket.io](http://socket.io/)
- a caching service for Angular

One of the key concepts of absync is that model properties can be decorated with permission requirements that affect the data during transaction, which allows you to hide or change properties when the model is transferred between the server and the client (and vice versa).