import express from "express";
import expressLayouts from "express-ejs-layouts";
import {dirname} from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";

const __dirname = dirname(fileURLToPath(import.meta.url));



const app = express();
const port = 5000;


app.use(bodyParser.urlencoded({extended:true}));

app.use(express.static("public"));

app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", "./views");
app.set("layout", "layout");



app.get("/", (req, res) => {
try{
  res.render("home.ejs", {
   title: "Home Page"
  });
}catch(error){
console.error("Error is: "+error)
}
});

app.get("/register",
  (req,res)=>{
    res.render("pages/register.ejs",{
      title:"Register"
    })
  }
);

app.get("/create-project",
  (req,res)=>{
    res.render("pages/create-project.ejs",{
      title: "Create Project"
    }
    )
  }
);

app.get("/home",
  (req,res)=>{
    res.render("home.ejs",{
      title: "Home Page"
    }
    )
  }
);

app.get("/add-project",
  (req,res)=>{
    res.render("pages/add-project.ejs",{
      title: "Add Project"
    }
    )
  }
);


app.post("/submit",
  (req,res)=>{
    
  }
)


app.listen(port,
    ()=>{
        console.log(`listening in: ${port}`);
    }
)

